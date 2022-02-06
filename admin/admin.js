const formControls = Array.from(document.querySelectorAll('[data-control]')).reduce((acc, val) => ({
	...acc,
	[val.dataset.control]: val
}), {});

const undoHistory = [];

const consoleElem = document.querySelector('#consoleText');
const databaseStatusTextElem = document.querySelector('#databaseStatusText');

let LOCAL_DB = null;

const container = document.querySelector('.database-editor-container');
const shiftEditorContainer = document.querySelector('.shift-editor-container');
const databaseEditor = new JSONEditor(container, {});

const cqSheetEditor = jspreadsheet(document.querySelector('.shift-editor-container'), {
	columns: [
		{
			title: "Time",
			help: "CQ Time. If left empty, the closest time above the cell will be used. DDMMMHHmm Format (03JAN0800)",
			placeholder: "DDMMMHHmm"
		},
		{
			title: "Room #",
			help: "Barracks Room Number",
			placeholder: "000"
		},
		{
			title: "Soldier",
			help: "Soldiers' Names",
			placeholder: "Doe, J.",
		},
	],
	tableOverflow: true,
	tableWidth: "100%",
	tableHeight: "100%"
});

formControls.impliedDate.value = dateToYYYYMMDD(new Date());

(async () => {
	fetch("/database").then(r => r.json()).then(json => {
		databaseEditor.set(json);
		LOCAL_DB = json;

		cqSheetEditor.setData(shiftsToSheetData(LOCAL_DB.shifts));

		resizeShiftEditorTable();
	});
})();

formControls.updateLastUpdate.addEventListener('click', () => {
	updateLocalDB({
		lastCQUpdate: Date.now()
	});
});

formControls.updateDatabase.addEventListener('click', () => {
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

			showStatus("danger", errStr);
			return;
		}

		showStatus("success", "Successfully updated database.");
	});
});

const shiftsBtnHandler = ({shiftsFunc, info}) => event => {
	const shifts = sheetDataToShifts(cqSheetEditor.getData());
	if(shiftsFunc(shifts)) showStatus("info", info);
};

formControls.mergeShifts.addEventListener('click', shiftsBtnHandler({
	shiftsFunc: shifts => {
		if(!confirm("Are you sure you want to merge the editor's shifts with the database? This action may delete unsaved shifts.")) return;
		updateLocalDB({
			shifts: mergeShifts(LOCAL_DB.shifts, shifts)
		});

		return true;
	},
	info: "Merged CQ Shifts (Make sure to click 'Update Database' to push the new changes.)"
}));

formControls.replaceShifts.addEventListener('click', shiftsBtnHandler({
	shiftsFunc: shifts => {
		if(!confirm("Are you sure you want to replace the database with the editor's shifts? This action may delete unsaved shifts.")) return;
		updateLocalDB({
			shifts
		});

		return true;
	},
	info: "Replaced CQ Shifts (Make sure to click 'Update Database' to push the new changes.)"
}));

formControls.updateShiftEditor.addEventListener('click', () => {
	if(!confirm("Are you sure you want to replace the editor with the current shifts? This action may delete unsaved shifts.")) return;
	cqSheetEditor.setData(shiftsToSheetData(LOCAL_DB.shifts));
	showStatus("info", "Updated Shifts Editor with database shifts.");
});

formControls.reformatEditor.addEventListener('click', () => {
	const impliedDate = formControls.impliedDate.value ? dateValueToDate(formControls.impliedDate.value) : new Date();
	const reformattedData = reformatSheetData(cqSheetEditor.getData(), impliedDate);
	cqSheetEditor.setData(reformattedData);
});

formControls.csvFile.onchange = event => {
	const file = event.target.files[0];
	const fileReader = new FileReader();

	fileReader.onload = event => {
		const grid = fileReader.result.split("\n").map(line => line.split(","));
		let formImpliedDate = formControls.impliedDate.value ? dateValueToDate(formControls.impliedDate.value) : new Date();
		let {grid: normalizedGrid, impliedDate} = normalizeSheetData(grid);
		const formattedGrid = reformatSheetData(normalizedGrid, impliedDate || formImpliedDate);

		cqSheetEditor.setData(formattedGrid);
	};

	fileReader.readAsText(file);
};

function resizeShiftEditorTable() {
	const boundingBox = shiftEditorContainer.getBoundingClientRect();
	const rowHeaderIndexWidth = document.querySelector('.jexcel_row').getBoundingClientRect().width;

	for (let i = 2; i >= 0; i--) {
		cqSheetEditor.setWidth(i, (boundingBox.width - rowHeaderIndexWidth - 10) / 3);
	}
}

function outerConsoleLog(str, replace) {
	if(replace) {
		consoleElem.value = consoleElem.value.split("\n").slice(0, -2).join("\n") + "\n";
	}
	consoleElem.value += str + "\n";
	consoleElem.scrollTop = Number.MAX_SAFE_INTEGER;
}

function updateLocalDB(obj={}) {
	let newLocalDB = databaseEditor.get();
	if(!newLocalDB) return;

	LOCAL_DB = {
		...LOCAL_DB,
		...newLocalDB,
		...obj
	};

	databaseEditor.set(LOCAL_DB);

	return LOCAL_DB;
}

function showStatus(type, status, settings) {
	new Noty({
		type,
		text: status,
		timeout: 5000,
		...settings
	}).show();
}

window.addEventListener("error", e => {
	outerConsoleLog(e.error ? e.error.stack || e.error : e);
});

window.addEventListener("resize", e => {
	resizeShiftEditorTable();
});