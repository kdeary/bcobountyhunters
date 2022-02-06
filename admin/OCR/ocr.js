const VERTEX_HANDLE_SIZE_FACTOR = 0.02;

const consoleElem = document.querySelector('#consoleText');
const perspectiveCanvas = document.querySelector('#perspectiveEditorCanvas');
const extractBtnElem = document.querySelector('#extractBtn');
const cancelExtractBtnElem = document.querySelector('#cancelExtractBtn');
const expandBtnElem = document.querySelector('#expandBtn');
const minimizeBtnElem = document.querySelector('#minimizeBtn');
const perspectiveOutputCanvas = document.querySelector('#perspectiveOutputCanvas');

const cqImageInputElem = document.querySelector('#cqImageInput');


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


cancelExtractBtnElem.style.display = "none";
minimizeBtnElem.style.display = "none";


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


const CURRENT_YEAR = new Date().getYear() + 1900;

function rawTextsToShifts(rawTexts) {
	const nameColumnsRaw = [rawTexts.NAME_COLUMN_1, rawTexts.NAME_COLUMN_2, rawTexts.NAME_COLUMN_3];
	const roomColumnsRaw = [rawTexts.ROOM_COLUMN_1, rawTexts.ROOM_COLUMN_2, rawTexts.ROOM_COLUMN_3];
	const dateComponents = (rawTexts.DATE.trim() || rawTexts.DATE2.trim()).split("-");
	const longFirst = Boolean(rawTexts.DATE2);

	const soldierNames = nameColumnsRaw.map(c => padArray(sanitizeNameColumn(c).slice(0, 24), 24, "???")).flat();
	const rooms = roomColumnsRaw.map(c => padArray(sanitizeRoomColumn(c).slice(0, 24), 24, 0)).flat();

	// console.log(roomColumnsRaw[0].split("\n"), soldierNames, rooms);

	let shifts = [];

	for (let i = soldierNames.length - 1; i >= 0; i -= 2) {
		const currentHour = (i / 2 + 12) % 24;
		const date = new Date(`${dateComponents[1]} ${dateComponents[0]} ${CURRENT_YEAR}`);

		if(i / 2 > (longFirst ? 24 : 12)) date.setDate(date.getDate() + 1);
		date.setHours(currentHour);

		shifts.push({
			"date": Number(date),
			"soldiers": [soldierNames[i], soldierNames[i-1]],
			"rooms": [rooms[i], rooms[i-1]],
		});
	}

	return shifts;
}

function sanitizeNameColumn(rawText) {
	return rawText.split("\n").filter(l => l !== "").map(s => pipeTrim(s).replace(/\|/g, "").trim());
}

function sanitizeRoomColumn(rawText) {
	return rawText.split("\n").filter(l => l !== "").map(s => s.replace(/\D/g, "").trim().slice(0, 3));
}

function pipeTrim(rawSoldier) {
	let pipeIndex = rawSoldier.indexOf("|");
	return rawSoldier.slice(pipeIndex > -1 ? pipeIndex : undefined);
}

function padArray(arr, len, fill) {
	return arr.concat(Array(Math.max(arr.length - len, 0)).fill(fill));
}

function distance(p1, p2) {
	return Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2);
}

function strokeCircle(ctx, point, radius) {
	ctx.beginPath();
	ctx.arc(point[0], point[1], radius, 0, 2 * Math.PI);
	ctx.stroke();
}

function toTesseractRect(rect) {
	return {
		left: rect[0],
		top: rect[1],
		width: rect[2],
		height: rect[3]
	};
}

function cloneCanvas(oldCanvas) {
	let newCanvas = document.createElement('canvas');
	let context = newCanvas.getContext('2d');
	newCanvas.width = oldCanvas.width;
	newCanvas.height = oldCanvas.height;
	context.drawImage(oldCanvas, 0, 0);

	return newCanvas;
}

function toAbsoluteRect(rect, dimensions) {
	return rect.map((n, idx) => n * dimensions[idx % 2]);
}