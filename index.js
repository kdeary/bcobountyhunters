import dotenv from 'dotenv';
dotenv.config();

import {fileURLToPath} from 'node:url';

import path from 'path';
import { Low, JSONFile } from 'lowdb';
import http from 'http';
import https from 'https';
import bodyparser from 'body-parser';
import cookieparser from 'cookie-parser';
import { query, validationResult } from 'express-validator';
import express from 'express';

import JSONBinAdapter from './JSONBinAdapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbFilePath = path.join(__dirname, 'db.json');
const PORT = process.env.PORT || 80;

const DB_SCHEMA = {
	lastCQUpdate: Date.now(),
	shifts: [{
		date: 0,
		soldiers: ["???", "???"],
		rooms: [0, 0]
	}]
};

const app = express();

let credentials;
let httpServer;

if(process.env.NODE_ENV === "local" || process.env.NODE_ENV === "heroku") {
	httpServer = http.createServer(app);
} else {
	credentials = require('../valid_ssl')();
	httpServer = https.createServer(credentials, app);
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
	if(req.cookies.key !== "kdeary") return next();
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
app.use('/admin', (req, res, next) => {
	if(req.cookies.key === "kdeary") return next();
}, express.static(path.join(__dirname, 'admin')));

(async () => {
	await db.read();

	db.data ||= DB_SCHEMA;
	db.data = {...DB_SCHEMA, ...db.data};

	await db.write();

	updateDBDependents();

	httpServer.listen(PORT, () => {
		console.log('listening on *:' + PORT);
	});
})();

function updateDBDependents() {
	const soldierHashTable = {};
	db.data.shifts.forEach(shift => shift.soldiers.forEach(name => soldierHashTable[name] = true));
	soldierNames = Object.keys(soldierHashTable);
}