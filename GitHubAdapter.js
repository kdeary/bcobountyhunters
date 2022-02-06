import { Octokit } from '@octokit/core';
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

class GitHubAdapter {
	read() {
		return readDBFile().then(json => {
			console.log(json);
			return json.data.content;
		});
	}

	async write(data) {
		return octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
			owner: process.env.GITHUB_REPO_OWNER,
			repo: process.env.GITHUB_REPO_NAME,
			path: process.env.GITHUB_DATABASE_FILE_NAME,
			message: 'Database Updated',
			content,
			sha
		});
	}
}

function readDBFile() {
	return octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
		owner: process.env.GITHUB_REPO_OWNER,
		repo: process.env.GITHUB_REPO_NAME,
		path: process.env.GITHUB_DATABASE_FILE_NAME
	}).then(r => r.json).then(json => {
		console.log(json);
		return json.data.content;
	});
}

export default GitHubAdapter;