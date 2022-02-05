
const databaseElem = document.querySelector('#databaseText');

const databaseStatusTextElem = document.querySelector('#databaseStatusText');

const updateLastUpdateBtnElem = document.querySelector('#updateLastUpdateBtn');
const updateDatabaseBtnElem = document.querySelector('#updateDatabaseBtn');

let LOCAL_DB = null;


(async () => {
	fetch("/database").then(r => r.json()).then(json => {
		databaseElem.value = stringifyDatabase(json);
		LOCAL_DB = json;
	});
})();

updateLastUpdateBtnElem.addEventListener('click', () => {
	updateLocalDB({
		lastCQUpdate: Date.now()
	});
});

updateDatabaseBtnElem.addEventListener('click', () => {
	changeDatabaseStatus();

	updateLocalDB({});

	fetch('/database', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			database: LOCAL_DB
		})
	}).then(r => r.json()).then(json => {
		if(json.err) {
			const errStr = "An error occurred while updating the database: " + json.err;
			console.log(errStr);

			changeDatabaseStatus("danger", errStr);
			return;
		}

		changeDatabaseStatus("success", "Successfully updated database.");
	});
});

function outerConsoleLog(str, replace) {
	if(replace) {
		consoleElem.value = consoleElem.value.split("\n").slice(0, -2).join("\n") + "\n";
	}
	consoleElem.value += str + "\n";
	consoleElem.scrollTop = Number.MAX_SAFE_INTEGER;
}

function updateLocalDB(obj={}) {
	const localDBString = databaseElem.value;
	let newLocalDB = null;

	changeDatabaseStatus();

	try {
		newLocalDB = parseJson(localDBString);
	} catch(e) {
		changeDatabaseStatus("danger", "An error occurred while parsing database text: " + e);
		console.log(e);
	}
	if(!newLocalDB) return;

	LOCAL_DB = {...LOCAL_DB, ...newLocalDB, ...obj};

	databaseElem.value = stringifyDatabase(LOCAL_DB);

	return LOCAL_DB;
}

function changeDatabaseStatus(type, status) {
	if(!type) return databaseStatusTextElem.innerText = "";
	databaseStatusTextElem.innerText = status || "";
	databaseStatusTextElem.classList.value = "";
	databaseStatusTextElem.classList.add("text-" + type);
}