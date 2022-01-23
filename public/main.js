const HOUR_MILLISECONDS = (60 * 60 * 1000);
const DAY_MILLISECONDS = 24 * HOUR_MILLISECONDS;
const MINS_15_MILLISECONDS = 15 * 60000;

const NO_SHIFT_BLURBS = ["lucky you...", "yay!", "nice."];

const DAY_START_DATE = editDate(new Date(), {
	ms: 0,
	seconds: 0,
	minutes: 0,
	hours: 0
});
const FIRST_FORMATION_HOURS_IN_WEEK = [8, 5, 5, 5, 5, 5, 8];

const trackerDateInputElem = document.querySelector('#trackerDateInput');
const lastCQUpdateTextElem = document.querySelector('#lastCQUpdateText');
const yourNameInputElem = document.querySelector('#yourNameInput');
const saveNameBtnElem = document.querySelector('#saveNameBtn');
const installAppBtnElem = document.querySelector('#installAppBtn');
const myShiftsFormElem = document.querySelector('#myShiftsForm');
const appInstallContainer = document.querySelector('.app-install-container');
const personalCQTrackerContainer = document.querySelector('.personal-cq-tracker-container');
const formationCQTrackerContainer = document.querySelector('.formation-cq-tracker-container');
const cqTrackerContainers = document.querySelectorAll('.main-cq-tracker-container');
const lazyImageElems = document.querySelectorAll('img[data-src]');

autocomplete({
	input: yourNameInputElem,
	fetch: async (query, update) => {
		try {
			const names = await fetch(`/soldiers?name=${query}`).then(r => r.json()).then(json => json.names);
			update(names.map(n => ({label: n, value: n})));
		} catch (error) {
			console.error("Search Error:", error);
		}
	},
	onSelect: item => {
		yourNameInputElem.value = item.label;
	}
});

let lastCQUpdateDate = null;
let deferredInstallPrompt = null;

personalCQTrackerContainer.style.display = "none";

lazyImageElems.forEach(lazyLoadImage);

(async () => {
	initTrackerDateInput();

	yourNameInputElem.value = CACHE.fetch('name', "").trim();

	const localShifts = processShifts(getLocalCQShifts());
	renderAll(localShifts);

	// Today's Shifts
	renderShiftsTable("loading");
	getCQShifts().then(shifts => renderAll({shifts: processShifts(shifts)}));

	// Personal Shifts
	updatePersonalCQTable();

	// Formation Shifts
	updateFormationCQTable();

	if(!window.isMobile && deferredInstallPrompt) {
		appInstallContainer.style.display = "block";
	}
})();

trackerDateInputElem.addEventListener('change', async (event) => {
	const inputDate = editDate(dateValueToDate(trackerDateInputElem.value), {
		ms: 0,
		seconds: 0,
		minutes: 0,
		hours: 0
	});

	renderShiftsTable("loading");
	const shifts = processShifts(await getCQShifts({
		date: inputDate
	}));
	renderShiftsTable(shifts);
});

installAppBtnElem.addEventListener('click', async () => {
	if(!deferredInstallPrompt) return;

	deferredInstallPrompt.prompt();
	deferredInstallPrompt.userChoice.then(choice => {
		console.log(choice);
	});
	deferredInstallPrompt = null;

	appInstallContainer.style.display = "none";
});

myShiftsFormElem.addEventListener('submit', event => {
	event.preventDefault();

	CACHE.update('name', yourNameInputElem.value);
	updatePersonalCQTable();
});

function renderAll({shifts}) {
	renderShiftsTable(shifts);
	if(lastCQUpdateDate) lastCQUpdateTextElem.innerText = "This CQ Table was updated on " + lastCQUpdateDate.toLocaleString();
}

function renderShiftsTable(shifts) {
	let shiftHalves;
	if(Array.isArray(shifts)) {
		const SHIFTS_LENGTH_HALF = shifts.length / 2;
		shiftHalves = [shifts.slice(0, SHIFTS_LENGTH_HALF), shifts.slice(SHIFTS_LENGTH_HALF)];
	} else shiftHalves = [shifts, shifts];

	cqTrackerContainers.forEach((elem, idx) => {
		elem.innerHTML = buildShiftsTableHTML(shiftHalves[idx]);
	});
}

function initTrackerDateInput() {
	trackerDateInputElem.value = dateToYYYYMMDD(DAY_START_DATE);
	trackerDateInputElem.min = dateToYYYYMMDD(editDate(SHIFT_DATE_SPAN[0], {
		ms: 0,
		seconds: 0,
		minutes: 0,
		hours: 0
	}));
	trackerDateInputElem.max = dateToYYYYMMDD(editDate(SHIFT_DATE_SPAN[1], {
		ms: 0,
		seconds: 0,
		minutes: 0,
		hours: 0
	}));
}

function buildShiftsTableHTML(shifts) {
	let tableBody = "";
	if(shifts === "loading") {
		tableBody = `
			<tr>
				<th scope="row" colspan="3">
					<p class="text-center">Loading Shifts...</p>
				</th>
			</tr>
		`;
	} else if(Array.isArray(shifts) && shifts.length > 0){
		tableBody = shifts.reduce((acc, val) => {
			const shiftedDate = val.date - MINS_15_MILLISECONDS;
			const isCurrentShift = Date.now() > shiftedDate && Date.now() < shiftedDate + HOUR_MILLISECONDS;
			return acc + `
				<tr class="${isCurrentShift ? "current-shift" : ""} top">
					<th class="time" scope="row" rowspan="2">
						${dateToMilitaryTime(val.date)}-${dateToMilitaryTime(val.date + HOUR_MILLISECONDS)}
						<br><small class="info">${val.info || ""}</small>
					</th>
					<td class="room">${val.rooms[0]}</td>
					<td class="name">${val.soldiers[0]}</td>
				</tr>
				<tr class="${isCurrentShift ? "current-shift" : ""}">
					<td class="room">${val.rooms[1]}</td>
					<td class="name">${val.soldiers[1]}</td>
				</tr>
			`;
		}, "");
	} else {
		tableBody = `
			<tr>
				<th scope="row" colspan="3">
					<p class="text-center">No CQ Shifts Found<br><small>${NO_SHIFT_BLURBS[Math.floor(Math.random() * NO_SHIFT_BLURBS.length)]}</small></p>
				</th>
			</tr>
		`;
	}

	return `
<table class="table cq-tracker">
	<thead>
		<tr>
			<th scope="col">Time</th>
			<th scope="col">Room</th>
			<th scope="col">Name</th>
		</tr>
	</thead>
	<tbody>
		${tableBody}
	</tbody>
</table>
`
}

function updatePersonalCQTable() {
	if(!yourNameInputElem.value) return;
	return getCQShifts({
		soldier: yourNameInputElem.value
	}).then(shifts => {
		shifts = shifts.map(s => ({...s, info: dateToMilitaryDate(s.date)}));

		personalCQTrackerContainer.innerHTML = buildShiftsTableHTML(shifts);
		personalCQTrackerContainer.style.display = "block";

		return shifts;
	});
}

function updateFormationCQTable() {
	return getCQShifts().then(shifts => {
		const bedChecks = shifts.find(s => new Date(s.date).getHours() === 20);
		const firstFormation = shifts.find(s => {
			const date = new Date(s.date);
			return date.getHours() === FIRST_FORMATION_HOURS_IN_WEEK[date.getDay()];
		});

		if(!firstFormation || !bedChecks) return shifts;

		firstFormation.info = "First Formation<br>" + dateToMilitaryDate(firstFormation.date);
		bedChecks.info = "Bed Checks<br>" + dateToMilitaryDate(bedChecks.date);

		formationCQTrackerContainer.innerHTML = buildShiftsTableHTML([firstFormation, bedChecks]);
		formationCQTrackerContainer.style.display = "block";

		return shifts;
	});
}

function getCQShifts({
	date=null,
	soldier=""
}={}) {
	if(date === null) date = DAY_START_DATE;
	if(soldier === null) 
	if(!window.navigator.onLine) {
		return getLocalCQShifts(date, soldier);
	}

	// console.log(date, Number(date), Number(date) + DAY_MILLISECONDS);

	return fetch(`/shifts?from=${Number(date)}&to=${Number(date) + DAY_MILLISECONDS - 1}&soldier=${soldier}`)
	.then(r => r.json())
	.then(json => {
		CACHE.update('shifts', json.shifts);

		lastCQUpdateDate = new Date(json.lastCQUpdate);

		return json.shifts;
	});
}

function getLocalCQShifts() {
	return CACHE.fetch('shifts', null);
}

function lazyLoadImage(element) {
	const highResURL = element.dataset.src;
	const image = new Image();

	image.onload = () => element.src = image.src;

	image.src = highResURL;
}

// window.addEventListener('beforeinstallprompt', e => {
// 	e.preventDefault();
// 	deferredInstallPrompt = e;
// 	appInstallContainer.style.display = "block";

// 	return false;
// });