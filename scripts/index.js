'use strict';

const esprima = require('esprima');
const fs = require('fs');
const path = require('path');
const rootPath = process.cwd();
const appRoot = path.normalize(rootPath);
const errorsDictionary = require(`${appRoot}/api/constants`).errors;
const defaultErrors = [
	{
		name: 'invalid_request',
		status: 400,
	},
	{
		name: 'access_denied',
		status: 403,
	},
	{
		name: 'invalid_token',
		status: 401,
	},
];
function findObjects(obj, targetProp, targetValue, finalResults) {

	function getObject(theObject, parent) {
		let result = null;
		if (theObject instanceof Array) {
			for (let i = 0; i < theObject.length; i++) {
				getObject(theObject[i], theObject);
			}
		} else {
			for (let prop in theObject) {
				if (theObject.hasOwnProperty(prop)) {
					if (prop === targetProp) {
						if (theObject[prop] === targetValue) {
							finalResults.push(parent);
						}
					}
					if (theObject[prop] instanceof Object || theObject[prop] instanceof Array) {
						getObject(theObject[prop], theObject);
					}
				}
			}
		}
	}

	getObject(obj);

}

const getEndpoint = (data, resultDataOfEndpoints, endpoints) => {
	try {
		let validator = null;
		let refToDataWithErrors = null;
		const endpointType = data.callee.property.name;
		const errors = [];
		if (data.arguments && data.arguments.length >= 2) {
			const args = data.arguments[data.arguments.length - 1]
			if (data.arguments[data.arguments.length - 2].arguments) {
				validator = data.arguments[data.arguments.length - 2].arguments[0].property.name;
			}
			if (args.body.body.length === 1) {
				refToDataWithErrors = args.body.body[0].block.body;
			} else {
				refToDataWithErrors = args.body.body;
			}
		} else {
			refToDataWithErrors = data.arguments[0].body.body;
		}
		findObjects(refToDataWithErrors, 'name', 'errors', errors);
		const resultErrors = errors.map(err => ({
			name: err.property.name,
			status: errorsDictionary[err.property.name].status,
		})).concat(defaultErrors);
		endpoints.arrayOfEndpoints.push({
			validator,
			endpointType,
			errors: [].concat(resultErrors),
		});
		if (data.callee.object.arguments[0].type === 'Literal') {
			resultDataOfEndpoints.push({
				route: data.callee.object.arguments[0].value,
				endpoints: [].concat(endpoints.arrayOfEndpoints),
			});
			return true;
		}
		getEndpoint(data.callee.object, resultDataOfEndpoints, endpoints);
	} catch (e) {
		console.log(e)
	}
};
const getEndpoints = (routes, resultDataOfEndpoints) => {
	routes.forEach((route) => {
		const endpoints = {
			route: '',
			arrayOfEndpoints: []
		};
		getEndpoint(route.expression, resultDataOfEndpoints, endpoints);
	});
	return resultDataOfEndpoints;
};
const getBodyExpressions = (array, element) => {
	if (element.type === 'ExpressionStatement' && element.expression.right) {
		if (element.expression.right.body) {
			element.expression.right.body.body.forEach((data) => {
				if (data.type === 'ExpressionStatement') array.push(data);
			});
		}
	}
	return array;
};
const getRoutes = () => {
	const server = esprima.parseScript(fs.readFileSync('api/server.js', 'utf-8'));
	let routes = [];
	findObjects(server, 'type', 'Literal', routes);
	const resultRoutes = {};
	routes
		.filter(item => item.length >= 2)
		.forEach((item) => {
			const func = item[item.length - 1]
			if (func.arguments) {
				if (func.arguments.length === 2 && func.arguments[0].name === 'app' && func.arguments[1].name === 'express') {
					const routeKeys = item[0].value.match(/\/?v?\d{0,}\/([a-z0-9]+)(\/.+)?/);
					Object.assign(resultRoutes, { [routeKeys[1]]: func.callee.arguments[0].value.replace('./', 'api/') })
				}
			}
		})
	return resultRoutes;
}
module.exports = {
	injectErrorsToRoutes: (data) => {
		const routes = getRoutes();
		const files = Object.keys(routes).map(key => routes[key]);
		const errors = files.map((file) => {
			const resultDataOfEndpoints = [];
			const content = esprima.parseScript(fs.readFileSync(`${appRoot}/${file}.js`, 'utf-8'));
			const routes = content.body.reduce(getBodyExpressions, []);

			getEndpoints(routes, resultDataOfEndpoints);

			return { file, resultDataOfEndpoints };
		});
		data.forEach((routeItem) => {
			const routeKeys = routeItem.path.match(/\/?v?\d{0,}\/([a-z0-9]+)(\/.+)?/);
			if (routeKeys && routeKeys[1]) {
				const eItem = errors.find(item => item.file === routes[routeKeys[1]]);
				let routeError = null;

				if (eItem) {
					routeError = eItem.resultDataOfEndpoints.find(route => route.route === (routeKeys[2] || '/'));
				}

				routeItem.errors = routeError ?
					routeError.endpoints.reduce(
						(res, item) => Object.assign(res, { [item.endpointType]: item.errors }), {}) :
					null
			}
		})
		return data
	}
};
