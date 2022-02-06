import dotenv from 'dotenv';
dotenv.config();

import ACME from 'acme';
import fs from 'fs';
import {fileURLToPath} from 'node:url';
import path from 'path';
import httpChallenge from 'acme-http-01-webroot';
import { generateAccount } from './key_gen.js';
import CSR from '@root/csr';
import fetch from 'node-fetch';
import PEM from '@root/pem';
import { X509Certificate } from 'crypto';
import Heroku from 'heroku-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync('package.json'));

const encoding = 'der';
const typ = 'CERTIFICATE REQUEST';

const heroku = new Heroku({ token: process.env.HEROKU_API_TOKEN });

initJSONBin();

const retrieveCerts = async ({domains}) => {
	let certs = await fetchCertsFromJSONBin();
	let certificate = certs ? new X509Certificate(Buffer.from(certs.cert + '\n' + certs.chain + '\n')) : null;
	const expiryDate = certificate ? new Date(certificate.validTo) : null;

	console.log("CERTIFICATE: ", certificate);

	if(!certificate || new Date().getTime() > expiryDate.getTime()) {
		console.log("Creating new certificates...");
		certs = await createCerts({domains}).catch(console.error);
		console.log("Saving certs to JSONBin");
		await saveCertsToJSONBin(certs);

		console.log(certs);

		console.log("Updating Heroku SSL");
		await heroku.post(`/apps/${process.env.HEROKU_APP}/ssl-endpoints`, {
			body: {
				certificate_chain: certs.certificate_chain,
				private_key: certs.private_key,
				preprocess: true
			}
		}).then(data => {
			console.log("Successfully updated Heroku SSL", data);
		}).catch(console.error);
	}

	await fs.promises.writeFile('./cert/fullchain.pem', certs.cert + '\n' + certs.chain + '\n', 'ascii');

	console.log("Wrote SSL certs to disk.");

	return certs;
};

const createCerts = async ({domains}) => {
	const webroot = httpChallenge.create({
		webroot: path.join(__dirname, 'public/.well-known/acme-challenge/') // default
	});

	const acme = ACME.create({
		packageAgent: pkg.name + '/' + pkg.version,
		domains,
		maintainerEmail: pkg.author.email,
		notify: function(event, details) {
			console.log({event, details});
		}
	});

	await acme.init('https://acme-staging-v02.api.letsencrypt.org/directory');
	console.log("Initiated ACME");

	let accountObj = await fetchAccountFromJSONBin();
	if(!accountObj) {
		console.log("Creating a new account...");
		accountObj = await generateAccount(acme, {
			subscriberEmail: pkg.author.email,
			agreeToTerms: true
		}).catch(console.error);
		await saveAccountToJSONBin(accountObj);
	}

	const {account, accountKey, serverKey, serverPem} = accountObj;

	console.info('Account:', account);

	const csrDer = await CSR.csr({ jwk: serverKey, domains, encoding }).catch(console.error);
	const csr = PEM.packBlock({ type: typ, bytes: csrDer });

	const challenges = {
		'http-01': webroot
	};

	console.log("Generating SSL certificates...");
	const pems = await acme.certificates.create({
		account,
		accountKey,
		csr,
		domains,
		challenges
	}).catch(console.error);

	console.log("Generated Certificates");

	return {
		...pems,
		private_key: serverPem,
		certificate_chain: pems.cert + '\n' + pems.chain + '\n'
	};
};

function initJSONBin() {
	return fetch(`https://jsonbin.org/${process.env.JSON_BIN_CERT_ID}`, {
		headers: {
			'Authorization': `token ${process.env.JSON_BIN_API_KEY}`
		}
	}).then(r => r.json()).then(json => {
		if(!json) return fetch(`https://jsonbin.org/${process.env.JSON_BIN_CERT_ID}`, {
			method: "POST",
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `token ${process.env.JSON_BIN_API_KEY}`
			},
			body: "{}"
		});
	});
}

function fetchCertsFromJSONBin() {
	return fetch(`https://jsonbin.org/${process.env.JSON_BIN_CERT_ID}`, {
		headers: {
			'Authorization': `token ${process.env.JSON_BIN_API_KEY}`
		}
	}).then(r => r.json()).then(json => {
		return json ? json.certs : null;
	});
}

function saveCertsToJSONBin(certs) {
	return fetch(`https://jsonbin.org/${process.env.JSON_BIN_CERT_ID}`, {
		method: "PATCH",
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `token ${process.env.JSON_BIN_API_KEY}`
		},
		body: JSON.stringify({certs})
	}).then(r => r.json());
}

function fetchAccountFromJSONBin() {
	return fetch(`https://jsonbin.org/${process.env.JSON_BIN_CERT_ID}`, {
		headers: {
			'Authorization': `token ${process.env.JSON_BIN_API_KEY}`
		}
	}).then(r => r.json()).then(json => {
		return json ? json.account : null;
	});
}

function saveAccountToJSONBin(account) {
	return fetch(`https://jsonbin.org/${process.env.JSON_BIN_CERT_ID}`, {
		method: "PATCH",
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `token ${process.env.JSON_BIN_API_KEY}`
		},
		body: JSON.stringify({account})
	}).then(r => r.json());
}

export { retrieveCerts, createCerts };