const CURRENT_YEAR = new Date().getYear() + 1900;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

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

function reformatSheetData(sheetData, impliedDate) {
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
