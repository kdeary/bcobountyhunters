const CACHE_SCHEMA = {name: "", shifts: window.DB_SCHEMA.shifts};

const CACHE = {
	data: JSON.parse(localStorage.getItem('CACHE')) || {...CACHE_SCHEMA},
	fetch: (key, defaultValue) => {
		return CACHE.data.hasOwnProperty(key) ? CACHE.data[key] : defaultValue;
	},
	update: (key, value) => {
		CACHE.data[key] = value;
		CACHE.save();
	},
	save: () => {
		return localStorage.setItem('CACHE', JSON.stringify({...CACHE_SCHEMA, ...CACHE.data}));
	}
};

CACHE.save();