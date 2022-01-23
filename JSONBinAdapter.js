import fetch from 'node-fetch';

class JSONBinAdapter {
	read() {
		return fetch(`https://jsonbin.org/${process.env.JSON_BIN_ID}`, {
			headers: {
				'Authorization': `token ${process.env.JSON_BIN_API_KEY}`
			}
		}).then(r => r.json()).then(json => (json || {}).data);
	}

	write(data) {
		return fetch(`https://jsonbin.org/${process.env.JSON_BIN_ID}`, {
			method: "POST",
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `token ${process.env.JSON_BIN_API_KEY}`
			},
			body: JSON.stringify({data})
		}).then(r => r.json());
	}
}

export default JSONBinAdapter;