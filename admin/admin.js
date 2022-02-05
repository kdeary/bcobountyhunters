const VERTEX_HANDLE_SIZE_FACTOR = 0.02;

const consoleElem = document.querySelector('#consoleText');
const databaseElem = document.querySelector('#databaseText');
const cqImageInputElem = document.querySelector('#cqImageInput');
const databaseStatusTextElem = document.querySelector('#databaseStatusText');
const perspectiveCanvas = document.querySelector('#perspectiveEditorCanvas');
const extractBtnElem = document.querySelector('#extractBtn');
const cancelExtractBtnElem = document.querySelector('#cancelExtractBtn');
const expandBtnElem = document.querySelector('#expandBtn');
const minimizeBtnElem = document.querySelector('#minimizeBtn');
const perspectiveOutputCanvas = document.querySelector('#perspectiveOutputCanvas');
const updateLastUpdateBtnElem = document.querySelector('#updateLastUpdateBtn');
const updateDatabaseBtnElem = document.querySelector('#updateDatabaseBtn');


const perspectiveContext = perspectiveCanvas.getContext('2d');
const perspectiveOutputContext = perspectiveOutputCanvas.getContext('2d');

const { createWorker } = Tesseract;
let worker;

let updatePerspectiveFunc;
let dragHandler;
let perspectivePoints;
let DEFAULT_POINTS;
let perspectiveInterval;
let cqImage;
let LOCAL_DB = null;

cancelExtractBtnElem.style.display = "none";
minimizeBtnElem.style.display = "none";

(async () => {
	fetch("/database").then(r => r.json()).then(json => {
		databaseElem.value = stringifyDatabase(json);
		LOCAL_DB = json;
	});
	await reloadWorker();
})();

cqImageInputElem.onchange = event => {
	const file = event.target.files[0];
	cqImage = new Image();

	cqImage.onload = event => {
		openPerspectiveEditor();
	};

	cqImage.src = URL.createObjectURL(file);
};

extractBtnElem.addEventListener('click', async () => {
	if(!cqImage) return;

	extractBtnElem.style.display = "none";
	cancelExtractBtnElem.style.display = "";
	await drawAlignedImage();
	extractBtnElem.style.display = "";
	cancelExtractBtnElem.style.display = "none";
});

cancelExtractBtnElem.addEventListener('click', async () => {
	cancelExtractBtnElem.disabled = true;
	cancelExtractBtnElem.innerText = "Cancelling...";
	await reloadWorker();
	extractBtnElem.style.display = "";
	cancelExtractBtnElem.style.display = "none";
	cancelExtractBtnElem.disabled = false;
	cancelExtractBtnElem.innerText = "Cancel Extract";
});

expandBtnElem.addEventListener('click', async () => {
	expandBtnElem.style.display = "none";
	minimizeBtnElem.style.display = "";
	changeEditorSize(true);
});

minimizeBtnElem.addEventListener('click', async () => {
	expandBtnElem.style.display = "";
	minimizeBtnElem.style.display = "none";
	changeEditorSize(false);
});

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

async function drawAlignedImage() {
	const glfx = fx.canvas();
	const texture = glfx.texture(cqImage);
	const cqDimensions = [2332, 1080];

	perspectiveOutputCanvas.width = cqDimensions[0];
	perspectiveOutputCanvas.height = cqDimensions[1];

	glfx.draw(texture).perspective(perspectivePoints.flat(), DEFAULT_POINTS.flat()).update();
	perspectiveOutputContext.drawImage(glfx, 0, 0, cqDimensions[0], cqDimensions[1]);

	const internalCanvas = cloneCanvas(perspectiveOutputCanvas);
	const ABSOLUTE_CQ_POINTS = Object.keys(window.CQ_IMAGE_POINTS).reduce((acc, key) => ({
		...acc,
		[key]: toAbsoluteRect(window.CQ_IMAGE_POINTS[key], cqDimensions)
	}), {});

	Object.values(ABSOLUTE_CQ_POINTS).forEach(rect => {
		perspectiveOutputContext.strokeStyle = 'red';
		perspectiveOutputContext.lineWidth = 3;
		perspectiveOutputContext.strokeRect(rect[0], rect[1], rect[2], rect[3]);
	});

	const pointKeys = Object.keys(ABSOLUTE_CQ_POINTS);
	const rawTextOutput = {};

	for (let i = pointKeys.length - 1; i >= 0; i--) {
		const key = pointKeys[i];
		let whitelist = "";

		if(key.startsWith("ROOM")) {
			whitelist = '0123456789';
		} else if(key.startsWith("NAME")) {
			whitelist = window.NAME_COLUMN_CHAR_WHITELIST;
		} else if(key === "DATE") {
			whitelist = window.NAME_COLUMN_CHAR_WHITELIST + '0123456789';
		}

		whitelist += "|\n ";

		await worker.setParameters({
			// tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK_VERT_TEXT,
			tessedit_char_whitelist: whitelist
		});

		rawTextOutput[key] = await worker.recognize(internalCanvas, {
			rectangle: toTesseractRect(ABSOLUTE_CQ_POINTS[key])
		});

		rawTextOutput[key] = rawTextOutput[key].data.text;
	}

	console.log(rawTextOutput);

	
	
	const shifts = rawTextsToShifts(rawTextOutput);
	
	updateLocalDB({
		shifts: [...LOCAL_DB.shifts, ...shifts]
	});

	outerConsoleLog("Successfully extracted shifts!");
}

function openPerspectiveEditor() {
	perspectiveCanvas.width = cqImage.width;
	perspectiveCanvas.height = cqImage.height;

	updatePerspectiveFunc = getPerspectiveEditorUpdateFunc(cqImage);

	clearInterval(perspectiveInterval);
	perspectiveInterval = setInterval(updatePerspectiveFunc, 1000 / 30);
}

function getPerspectiveEditorUpdateFunc(cqImage) {
	DEFAULT_POINTS = [
		[0, 0],
		[perspectiveCanvas.width, 0],
		[perspectiveCanvas.width, perspectiveCanvas.height],
		[0, perspectiveCanvas.height]
	];
	perspectivePoints = DEFAULT_POINTS.map(p => [p[0], p[1]]);

	dragHandler = new Dragger({canvas: perspectiveCanvas});

	const VERTEX_HANDLE_SIZE = VERTEX_HANDLE_SIZE_FACTOR * Math.max(perspectiveCanvas.width, perspectiveCanvas.height);

	dragHandler.onCanvasClick = () => {
		const closestPoint = perspectivePoints.reduce((acc, val, idx) => {
			const d = distance(Object.values(dragHandler.dragStart), val);
			return d < acc[1] ? [idx, d] : acc;
		}, [-1, VERTEX_HANDLE_SIZE]);

		if(closestPoint[0] > -1) {
			return "p" + closestPoint[0];
		}
	};

	dragHandler.onCanvasDrag = drag => {
		if(drag.startsWith("p")) {
			const pointIndex = Number(drag.slice(1));
			perspectivePoints[pointIndex] = dragHandler.addDrag(perspectivePoints[pointIndex]);
		}
	};

	return () => {
		perspectiveContext.clearRect(0, 0, perspectiveCanvas.width, perspectiveCanvas.height)
		perspectiveContext.drawImage(cqImage, 0, 0);

		for (let i = perspectivePoints.length - 1; i >= 0; i--) {
			perspectiveContext.strokeStyle = "red";
			perspectiveContext.lineWidth = VERTEX_HANDLE_SIZE / 8;
			strokeCircle(perspectiveContext, perspectivePoints[i], VERTEX_HANDLE_SIZE);
			strokeCircle(perspectiveContext, perspectivePoints[i], VERTEX_HANDLE_SIZE / 8);
		}
	};
}

function outerConsoleLog(str, replace) {
	if(replace) {
		consoleElem.value = consoleElem.value.split("\n").slice(0, -2).join("\n") + "\n";
	}
	consoleElem.value += str + "\n";
	consoleElem.scrollTop = Number.MAX_SAFE_INTEGER;
}

async function reloadWorker() {
	if(worker) await worker.terminate();
	worker = createWorker({
		logger: m => {
			console.log(m);
			outerConsoleLog(`${m.status}${m.progress ? " | " + Math.round(m.progress * 100) + "%" : ""}`, m.progress > 0);
		}
	});

	await worker.load();
	await worker.loadLanguage('eng');
	await worker.initialize('eng');
}

function changeEditorSize(expanded) {
	perspectiveCanvas.classList[expanded ? "add" : "remove"]("expanded");
	minimizeBtnElem.classList[expanded ? "add" : "remove"]("expanded");
	document.body.classList[expanded ? "add" : "remove"]("expanded");
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