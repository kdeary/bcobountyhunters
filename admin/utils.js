const CURRENT_YEAR = new Date().getYear() + 1900;

function rawTextsToShifts(rawTexts) {
	const nameColumnsRaw = [rawTexts.NAME_COLUMN_1, rawTexts.NAME_COLUMN_2, rawTexts.NAME_COLUMN_3];
	const roomColumnsRaw = [rawTexts.ROOM_COLUMN_1, rawTexts.ROOM_COLUMN_2, rawTexts.ROOM_COLUMN_3];
	const dateComponents = rawTexts.DATE.trim().split("-");

	const soldierNames = nameColumnsRaw.map(c => padArray(sanitizeNameColumn(c).slice(0, 24), 24, "???")).flat();
	const rooms = roomColumnsRaw.map(c => padArray(sanitizeRoomColumn(c).slice(0, 24), 24, 0)).flat();

	// console.log(roomColumnsRaw[0].split("\n"), soldierNames, rooms);

	let shifts = [];

	for (let i = soldierNames.length - 1; i >= 0; i -= 2) {
		const currentHour = (i / 2 + 12) % 24;
		const date = new Date(`${dateComponents[1]} ${dateComponents[0]} ${CURRENT_YEAR}`);

		if(i / 2 > 12) date.setDate(date.getDate() + 1);
		date.setHours(currentHour);

		shifts.push({
			"date": Number(date),
			"soldiers": [soldierNames[i], soldierNames[i-1]],
			"rooms": [rooms[i], rooms[i-1]],
		});
	}

	return shifts;
}

function stringifyDatabase(db) {
	const newDB = {
		...db,
		shifts: db.shifts.map(shift => ({
			...shift,
			date: shift.date,
			soldiers: JSON.stringify(shift.soldiers),
			rooms: JSON.stringify(shift.rooms)
		}))
	};

	let dbStr = JSON.stringify(newDB, null, 4);
	dbStr = dbStr.replace(/ "\[/g, " [").replace(/\]"/g, "]").replace(/\\"/g, '"');

	return dbStr;
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