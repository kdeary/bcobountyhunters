import dotenv from 'dotenv';
dotenv.config();

import {fileURLToPath} from 'node:url';

import path from 'path';
import fs from 'fs';
import { Low, JSONFile } from 'lowdb';
import http from 'http';
import https from 'https';
import bodyparser from 'body-parser';
import cookieparser from 'cookie-parser';
import { retrieveCerts } from './get_certificates.js';
import clientCertificateAuth from 'client-certificate-auth';
import { query, validationResult } from 'express-validator';
import express from 'express';

import JSONBinAdapter from './JSONBinAdapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync('package.json'));

const dbFilePath = path.join(__dirname, 'db.json');
const PORT = process.env.PORT || 80;
const domains = [process.env.DOMAIN];

const DB_SCHEMA = {
	lastCQUpdate: Date.now(),
	shifts: [{
		date: 0,
		soldiers: ["???", "???"],
		rooms: [0, 0]
	},
	{
		date: 0,
		soldiers: [],
		rooms: [],
		empty: true
	}]
};

const app = express();

let credentials;
let httpServer;

if(process.env.NODE_ENV === "local") {
	httpServer = http.createServer(app);
} else {
	httpServer = http.createServer(app);
	(async () => {
		const pems = await retrieveCerts({domains});
		console.log({pems});

		if(!(pems && pems.privkey && pems.cert && pems.chain)) return console.error("Couldn't get certs");

		credentials = {
			key: pems.key,
			cert: pems.fullchain,
			// issuer/CA certificate against which the client certificate will be
			// validated. A certificate that is not signed by a provided CA will be
			// rejected at the protocol layer.
			ca: [ 
				fs.readFileSync('dod_certs/Certificates_PKCS7_v5.9_DoD.pem.p7b'),
				// fs.readFileSync('dod_certs/Certificates_PKCS7_v5.9_DoD.pem.p7b'),
				fs.readFileSync('dod_certs/DoD_PKE_PEM.pem')
			],
			// request a certificate, but don't necessarily reject connections from
			// clients providing an untrusted or no certificate. This lets us protect only
			// certain routes, or send a helpful error message to unauthenticated clients.
			requestCert: true,
			rejectUnauthorized: false
		};

		httpServer.close(() => {
			httpServer = https.createServer(credentials, app);
			startListener(httpServer);
		});
		setImmediate(() => {httpServer.emit('close')});
	})();
}

let adapter;
if(process.env.NODE_ENV === "local") {
	adapter = new JSONFile(dbFilePath);
} else {
	adapter = new JSONBinAdapter();
}

const db = new Low(adapter);

let soldierNames = [];

app.use(bodyparser.urlencoded({ extended: false }));
app.use(bodyparser.json());
app.use(cookieparser());

app.use((req, res, next) => {
	if((req.secure || req.headers["x-forwarded-proto"] === "https") || process.env.NODE_ENV === "local"){
		// request was via https, so do no special handling
		next();
	} else {
		// request was via http, so redirect to https
		res.redirect('https://' + req.headers.host + req.url);
	}
});

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, '/public/index.html'));
});

app.get('/settings.js', (req, res) => {
	const minMaxShiftDate = db.data.shifts.reduce(
		(a, b) => [Math.min(a[0], b.date), Math.max(a[1], b.date)],
		[Date.now(), Date.now()]
	).map(date => new Date(date));

	res.send(`window.DB_SCHEMA = ${JSON.stringify(DB_SCHEMA)};window.SHIFT_DATE_SPAN = ${JSON.stringify(minMaxShiftDate)};`);
});

app.get('/admin', (req, res, next) => {
	if(req.cookies.key !== "kdeary") return res.sendFile(path.join(__dirname, '/public/key.html'));
	res.sendFile(path.join(__dirname, '/admin/index.html'));
});

app.get(
	'/shifts',
	query('from').isInt().toInt(),
	query('to').isInt().toInt(),
	query('soldier').isLength({ max: 100 }).trim().escape(),
async (req, res) => {
	const errors = validationResult(req);
	if(!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

	const input = req.query;
	const { shifts } = db.data;

	// console.log(input, shifts);

	const filteredShifts = shifts.filter(shift => {
		const lowerCaseSoldiers = shift.soldiers.map(s => s.toLowerCase());
		return (
			shift.date >= input.from &&
			shift.date <= input.to &&
			(!input.soldier || lowerCaseSoldiers.includes(input.soldier.toLowerCase()))
		);
	});

	res.json({
		lastCQUpdate: db.data.lastCQUpdate,
		shifts: filteredShifts
	});
});

app.get(
	'/soldiers',
	query('name').isLength({ min: 2, max: 100 }).trim().escape(),
async (req, res) => {
	const errors = validationResult(req);
	if(!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

	const input = req.query;
	const nameQuery = input.name.toLowerCase();

	const filteredNames = soldierNames.filter(n => n.toLowerCase().includes(nameQuery));

	res.json({
		names: filteredNames
	});
});

app.get('/database', async (req, res) => {
	await db.read();
	res.json(db.data);
});

app.post('/database', async (req, res) => {
	if(!req.body.database) return {err: "Empty Database"};

	await db.read();
	db.data = {
		...db.data,
		...req.body.database
	};
	await db.write();

	updateDBDependents();

	res.json({success: true});
});

app.use('/', express.static(path.join(__dirname, 'public')));
app.use('/admin', clientCertificateAuth(console.log), (req, res, next) => {
	if(req.cookies.key === "kdeary") return next();
}, express.static(path.join(__dirname, 'admin')));

(async () => {
	await db.read();

	db.data ||= DB_SCHEMA;
	db.data = {...DB_SCHEMA, ...db.data};

	await db.write();

	updateDBDependents();

	await repeatUntil(() => {}, () => httpServer);

	startListener(httpServer);
})();

function startListener(server) {
	server.listen(PORT, () => {
		console.log('listening on *:' + PORT);
	});
}

function updateDBDependents() {
	const soldierHashTable = {};
	db.data.shifts.forEach(shift => shift.soldiers.forEach(name => soldierHashTable[name] = true));
	soldierNames = Object.keys(soldierHashTable);
}

function repeatUntil(doFunc, boolFunc, time = 100) {
	return new Promise((resolve, reject) => {
		// let time = 0;
		let counter = 0;
		let interval = setInterval(() => {
			counter++;

			try {
				if(boolFunc(counter)) {
					resolve();
					clearInterval(interval);
				} else doFunc(counter, resolve, interval);
			} catch(e) {
				reject(e);
			}
		}, time);
	});
}