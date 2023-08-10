(function () {
	const vscode = acquireVsCodeApi();
    const globalDefaultsSelector = document.querySelectorAll('.refactcss-radio');
    const globalLabels = document.querySelectorAll('.refactcss-privacy__item label');
    let globalDefault;
    let popup;
    let rules;
    let infurl = '';
    let infurl_notice = `The self-hosted URL is not empty. Your data can go only to your server, all third party functions are disabled.<br> If you want both private self-hosted server and 3rd party functions (such as GPT chat) at the same time, request this on Refact.ai Discord!`;

    globalLabels.forEach((label) => {
        label.addEventListener("click", (event) => {
            event.preventDefault();
            const selectedText = event.target.innerText;
            const selectedValue = event.target.children[0].value;
            showPopup(`Be careful!<br><br>You are about to change the global privacy default to:<br><br><b> ${selectedText}</b><br><br>This might affect privacy for many projects and files that don't have their own privacy rule.`, "OK");
            const listenOk = document.querySelector('.privacy-popup-ok').addEventListener("click", (event) => {
                event.target.children.checked = true;
                vscode.postMessage({ type: "globalDefault", value: selectedValue });
                popup.remove();
                this.removeEventListener("click",listenOk);
            });
        });
    });

    window.addEventListener("message", (event) => {
		const message = event.data;
		switch (message.command) {
            case "rules":
                rules = message.value;
                break;
			case "overrides":
                const table = document.querySelector('.overrides__body');
                table.innerHTML = "";
                for (const key in message.value) {
                    addOverride(key, message.value[key]);
                }
				break;
            case "defaults":
                globalDefaultsSelector.forEach((input, index) => {
                    if(index === Number.parseInt(message.value)) {
                        globalDefault = Number.parseInt(message.value);
                        input.checked = true;
                    }
                });
                break;
        }
    });

    function addOverride(uri, state) {
        const table = document.querySelector('.overrides__body');
        let row = document.createElement("div");
        row.classList.add("overrides__item");
        let path = document.createElement("div");
        path.classList.add("overrides__path");
        path.innerHTML = uri;
        row.appendChild(path);
        let selector = document.createElement("div");
        selector.classList.add("overrides__selector");
        let select = document.createElement("select");
        rules.forEach((element,index) => {
            let option = document.createElement("option");
            option.value = element.value;
            option.text = element.name;
            if(index === 0) {
                option.text = element.name + ": " + element.short_description;
            }
            if(Number.parseInt(state) === index) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        selector.appendChild(select);
        row.appendChild(selector);
        let action = document.createElement("div");
        action.classList.add("overrides__action");
        let button = document.createElement("button");
        button.classList.add("overrides__delete");
        button.innerHTML = `<svg height="512px" id="Layer_1" style="enable-background:new 0 0 512 512;" version="1.1" viewBox="0 0 512 512" width="512px" xml:space="preserve" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><g><path d="M413.7,133.4c-2.4-9-4-14-4-14c-2.6-9.3-9.2-9.3-19-10.9l-53.1-6.7c-6.6-1.1-6.6-1.1-9.2-6.8c-8.7-19.6-11.4-31-20.9-31   h-103c-9.5,0-12.1,11.4-20.8,31.1c-2.6,5.6-2.6,5.6-9.2,6.8l-53.2,6.7c-9.7,1.6-16.7,2.5-19.3,11.8c0,0-1.2,4.1-3.7,13   c-3.2,11.9-4.5,10.6,6.5,10.6h302.4C418.2,144.1,417,145.3,413.7,133.4z"/><path d="M379.4,176H132.6c-16.6,0-17.4,2.2-16.4,14.7l18.7,242.6c1.6,12.3,2.8,14.8,17.5,14.8h207.2c14.7,0,15.9-2.5,17.5-14.8   l18.7-242.6C396.8,178.1,396,176,379.4,176z"/></g></svg>`;
        button.addEventListener("click", (event) => {
            currentFile = uri.split("/");
            currentLevel = Number.parseInt(state);
            const defaultLevel = rules.find(obj => obj.value === Number.parseInt(globalDefault));
            showPopup(`Privacy policy for ${currentFile[currentFile.length - 1]} is currently at Level ${currentLevel}<br><br>If you delete this rule, the global privacy default and rules for the parent folders will apply.`, "Delete");
            const listenDelete = document.querySelector('.privacy-popup-ok').addEventListener("click", (event) => {
                vscode.postMessage({ type: "deleteOverride", value: uri });
                popup.remove();
                this.removeEventListener("click",listenDelete);
            });
        });
        select.addEventListener("change", (event) => {
            vscode.postMessage({ type: "selectOverride", value: [uri, select.value] });
        });
        action.appendChild(button);
        row.appendChild(action);
        table.appendChild(row);
    }

    function showPopup(text, actionButtonText) {
        const old_popups = document.querySelectorAll('.privacy-popup');
        if(old_popups.length > 0) {
            for (const popup of old_popups) {
                document.body.removeChild(popup);
            }
        }
        popup = document.createElement("div");
        const popupContent = document.createElement("div");
        const popupActions = document.createElement("div");
        const popupCancel = document.createElement("button");
        const popupOK = document.createElement("button");
        popup.classList.add("privacy-popup");
        popupContent.classList.add("privacy-popup-content");
        popupActions.classList.add("privacy-popup-actions");
        popupCancel.classList.add("privacy-popup-cancel");
        popupOK.classList.add("privacy-popup-ok");
        popupContent.innerHTML = text;
        popup.appendChild(popupContent);
        popupCancel.innerHTML = 'Cancel';
        popupOK.innerHTML = actionButtonText;
        popupActions.appendChild(popupCancel);
        popupActions.appendChild(popupOK);
        popup.appendChild(popupActions);
        document.body.appendChild(popup);
        const listenCancel = popupCancel.addEventListener("click", (event) => {
            document.body.removeChild(popup);
            popupCancel.removeEventListener("click",listenCancel);
        });
    }
})();
