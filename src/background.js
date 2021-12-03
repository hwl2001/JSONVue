/* global window, document, chrome, fetch, localStorage, chrome, Worker */

let path, value, copyPathMenuEntryId, copyValueMenuEntryId, options;

async function getDefaultTheme() {
	return (await fetch("jsonview.css")).text();
}

function copy(value) {
	const selElement = document.createElement("span");
	const selRange = document.createRange();
	selElement.innerText = value;
	document.body.appendChild(selElement);
	selRange.selectNodeContents(selElement);
	const selection = window.getSelection();
	selection.removeAllRanges();
	selection.addRange(selRange);
	document.execCommand("Copy");
	document.body.removeChild(selElement);
}

function refreshMenuEntry() {
	const options = localStorage.options ? JSON.parse(localStorage.options) : {};
	if (options.addContextMenu && !copyPathMenuEntryId) {
		copyPathMenuEntryId = chrome.contextMenus.create({
			title: "Copy path",
			contexts: ["page", "link"],
			onclick: function () {
				copy(path);
			}
		});
		copyValueMenuEntryId = chrome.contextMenus.create({
			title: "Copy value",
			contexts: ["page", "link"],
			onclick: function () {
				copy(value);
			}
		});
	}
	if (!options.addContextMenu && copyPathMenuEntryId) {
		chrome.contextMenus.remove(copyPathMenuEntryId);
		chrome.contextMenus.remove(copyValueMenuEntryId);
		copyPathMenuEntryId = null;
	}
}

options = {};
if (localStorage.options)
	options = JSON.parse(localStorage.options);
if (typeof options.addContextMenu == "undefined") {
	options.addContextMenu = true;
	localStorage.options = JSON.stringify(options);
}

if (!localStorage.theme)
	getDefaultTheme().then(theme => {
		localStorage.theme = theme;
		refreshMenuEntry();
	});
else
	refreshMenuEntry();

chrome.runtime.onConnect.addListener(function (port) {
	port.onMessage.addListener(function (msg) {
		const json = msg.json;
		let workerFormatter, workerJSONLint;

		function onWorkerJSONLintMessage(event) {
			const message = JSON.parse(event.data);
			workerJSONLint.removeEventListener("message", onWorkerJSONLintMessage, false);
			workerJSONLint.terminate();
			port.postMessage({
				ongetError: true,
				error: message.error,
				loc: message.loc,
				offset: msg.offset
			});
		}

		function onWorkerFormatterMessage(event) {
			const message = event.data;
			workerFormatter.removeEventListener("message", onWorkerFormatterMessage, false);
			workerFormatter.terminate();
			if (message.html)
				port.postMessage({
					onjsonToHTML: true,
					html: message.html,
					theme: localStorage.theme
				});
			if (message.error) {
				workerJSONLint = new Worker("workerJSONLint.js");
				workerJSONLint.addEventListener("message", onWorkerJSONLintMessage, false);
				workerJSONLint.postMessage(json);
			}
		}

		if (msg.init)
			port.postMessage({
				oninit: true,
				options: localStorage.options ? JSON.parse(localStorage.options) : {}
			});
		if (msg.copyPropertyPath) {
			path = msg.path;
			value = msg.value;
		}
		if (msg.jsonToHTML) {
			workerFormatter = new Worker("workerFormatter.js");
			workerFormatter.addEventListener("message", onWorkerFormatterMessage, false);
			workerFormatter.postMessage({
				json: json,
				fnName: msg.fnName
			});
		}
	});
});
chrome.runtime.onMessage.addListener(message => {
	if (message == "refreshMenuEntry")
		refreshMenuEntry();
});