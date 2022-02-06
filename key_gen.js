import Keypairs from '@root/keypairs';
import fs from 'fs';

const generateAccount = async (acme, accountSettings) => {
	let accountKey;
	let serverKey;

	let accountPemFile = await fs.promises.readFile('./cert/account_privkey.pem').then(r => r.toString()).catch(() => null);
	let serverPemFile = await fs.promises.readFile('./cert/server_privkey.pem').then(r => r.toString()).catch(() => null);
	let accountFile = await fs.promises.readFile('./cert/account.json').catch(() => null);

	if(accountPemFile) {
		accountKey = await Keypairs.import({ pem: accountPemFile });
	} else {
		let accountKeypair = await Keypairs.generate({ kty: 'EC', format: 'jwk' });
		accountKey = accountKeypair.private;
		let accountPem = await Keypairs.export({ jwk: accountKey });
		await fs.promises.writeFile('./cert/account_privkey.pem', accountPem, 'ascii');
	}

	if(serverPemFile) {
		serverKey = await Keypairs.import({ pem: serverPemFile });
	} else {
		let serverKeypair = await Keypairs.generate({ kty: 'RSA', format: 'jwk' });
		serverKey = serverKeypair.private;
		let serverPem = await Keypairs.export({ jwk: serverKey });
		await fs.promises.writeFile('./cert/server_privkey.pem', serverPem, 'ascii');
	}

	let account;
	if(accountFile) {
		account = JSON.parse(accountFile);
	} else {
		account = await acme.accounts.create({
			...accountSettings,
			accountKey
		});

		await fs.promises.writeFile('./cert/account.json', JSON.stringify(account), 'ascii');
	}

	return {account, serverKey, accountKey};
};

export {generateAccount};