import { Octokit } from '@octokit/core';
const octokit = new Octokit({ auth: `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` });

class GitHubAdapter {
	read() {
		return readDBFile().then(json => {
			console.log(json);
			return json.data.content;
		});
	}

	async write(data) {
		awai

		return octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
			owner: 'kdeary',
			repo: 'bcobountyhunters_database',
			path: 'db.json',
			message: 'Database Updated',
			content,
			sha
		});
	}
}

function readDBFile() {
	return octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
		owner: 'kdeary',
		repo: 'bcobountyhunters_database',
		path: 'db.json'
	}).then(r => r.json).then(json => {
		console.log(json);
		return json.data.content;
	});
}

export default GitHubAdapter;