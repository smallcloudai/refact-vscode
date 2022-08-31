(function () {
	const vscode = acquireVsCodeApi();
    const apiKeyField = document.querySelector('#apiKey');
    const buttonSubmit = document.querySelector('.s-submit');

    apiKeyField.addEventListener("change",(event) => {
        vscode.postMessage({ type: "apiKey", value: event.target.value });
    });

    buttonSubmit.addEventListener("click",(event) => {
        vscode.postMessage({ type: "buttonSubmit", value: event.target.value });
    });
})();
