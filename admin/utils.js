const CURRENT_YEAR = new Date().getYear() + 1900;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
const DAYS_OF_THE_WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

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

function shiftsToSheetData(shifts) {
	return shifts.reduce((acc, s) => {
		if(s.empty) return acc.concat([[dateToDDMMM0000(s.date), '', '']]);

		return acc.concat(s.soldiers.map((soldier, idx) => [idx === 0 ? dateToDDMMM0000(s.date) : '', s.rooms[idx], soldier]));
	}, []);
}

function sheetDataToShifts(sheetData) {
	let lastDate = new Date("Invalid Date");
	let shifts = {};

	for (let i = 0; i < sheetData.length; i++) {
		const shiftDate = sheetData[i][0] ? DDMMM0000ToDate(sheetData[i][0]) : lastDate;

		if(!isValidDate(shiftDate)) throw `Error: Invalid Date on line #${i+1} ('${sheetData[i].join("','")}')`;

		if(sheetData[i][1] === "" || sheetData[i][2] === "") {
			if(!shifts[shiftDate]) shifts[shiftDate] = {date: Number(shiftDate), soldiers: [], rooms: [], empty: true};
			continue;
		}

		if(!shifts[shiftDate]) shifts[shiftDate] = {date: Number(shiftDate), soldiers: [], rooms: []};

		shifts[shiftDate].rooms.push(sheetData[i][1]);
		shifts[shiftDate].soldiers.push(sheetData[i][2]);

		lastDate = shiftDate;
	}

	return Object.values(shifts);
}

function normalizeSheetData(sheetData) {
	if(sheetData[0].length === 3) return {grid: sheetData, impliedDate: null};

	// Find Date on CQ Sheet
	const cqSheetDateComponents = findDateOnCQSheet(sheetData).split("-");
	let cqDate = new Date(`${cqSheetDateComponents[1]} ${cqSheetDateComponents[0]} ${CURRENT_YEAR}`);
	if(!isValidDate(cqDate)) cqDate = null;
	console.log(cqDate);

	const times = findColumnsData(cell => DAYS_OF_THE_WEEK.includes(cell.trim()), sheetData).flat();
	const rooms = findColumnsData(cell => cell === "rm#", sheetData).flat();
	const soldiers = findColumnsData(cell => cell === "name", sheetData).flat();

	const newGrid = [];

	for (let i = 0; i < times.length; i++) {
		newGrid.push([times[i], rooms[i], soldiers[i] || ""]);
	}

	console.log(newGrid);

	return {
		grid: newGrid,
		impliedDate: cqDate
	};
}

function reformatSheetData(sheetData, impliedDate) {
	if(!impliedDate) throw "No implied date given.";

	let currentImpliedDate = impliedDate;

	const shiftLines = sheetData.map((line, idx) => {
		let date = line[0];
		if(date.length === 0) {
		} else if(date.length > 0) {
			if(date.includes('-')) date = cqDateToDDMMM0000(date, currentImpliedDate)
			else if(date.length === 9) {}
		}

		if(date.endsWith("2300")) currentImpliedDate = new Date(currentImpliedDate.getTime() + DAY_MILLISECONDS);

		return [
			date.replace(/[^\w .,]+/gi, ""),
			line[1],
			line[2].replace(/[^\w .,]+/gi, "")
		];
	});

	return trimSpreadsheet(shiftLines);
}

function trimSpreadsheet(grid) {
	let lastEmptyIndex = grid.reverse().findIndex(l => l.join("").length !== 0) - 1;
	if(lastEmptyIndex < 0) return grid.reverse();

	console.log(grid);

	return grid.slice(lastEmptyIndex).reverse();
}

function mergeShifts(...shiftArrs) {
	return Object.values(shiftArrs.flat().reduce((acc, s) => ({
		...acc,
		[s.date]: s
	}), {}));
}

function findColumnsData(func, sheetData) {
	const columns = [];
	for (let i = 0; i < sheetData.length; i++) {
		for (let j = 0; j < sheetData[i].length; j++) {
			if(func(sheetData[i][j].toLowerCase(), i, j)) {
				columns.push(slice2d(sheetData, i + 1, j, Infinity, j).flat());
			}
		}
	}

	return columns;
}

function slice2d(array, sx, sy, ex, ey) {
	return array.slice(sx, ex + 1).map(i => i.slice(sy, ey + 1));
}

function findDateOnCQSheet(sheetData) {
	for (let i = 0; i < sheetData.length; i++) {
		if(
			date = sheetData[i].find(cell => /^\d{1,2}-[a-z][a-z][a-z]/gi.test(cell.trim()))
		) return date;
	}

	return null;
}

function checkShiftsValidness(data) {
	// Generate tooltip content for each problem
	const titles = data.map(line => [
		checkShiftTime,
		checkShiftRoom,
		() => {}
	].map((func, idx) => func(line[idx])));

	// Display the cell as invalid if there's a problem
	const classNames = data.map(
		(line, index) => line.map((cell, idx) => titles[index][idx] ? "invalid" : line[idx] && "valid")
	);

	return { titles, classNames };
}

function checkShiftTime(time) {
	return time.length !== 0 && time.length > 9 ? "Invalid date" : undefined;
}

function checkShiftRoom(room) {
	return room.length !== 0 && room.length > 3 || isNaN(Number(room)) ? "Invalid Room #" : undefined;
}
