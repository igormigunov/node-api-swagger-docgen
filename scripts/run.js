const fs = require('fs');
const path = require('path');
const rootPath = process.cwd();
const appRoot = path.normalize(rootPath);
const generateSwagger = require('../index');
const run = app => fs.exists(`${appRoot}api/swagger/swagger.json`, (exists) => {
	if (exists) {
		const json = require(`${appRoot}api/swagger/swagger.json`);
		generateSwagger(app, { json, rootPath: `${appRoot}/api/swagger/`  });
	} else {
		generateSwagger(app, { rootPath: `${appRoot}/api/swagger/` });
	}
});
module.exports = run
