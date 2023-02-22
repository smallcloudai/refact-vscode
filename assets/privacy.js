(function () {
	const vscode = acquireVsCodeApi();
    const globalDefaultsSelector = document.querySelectorAll('.codify-radio');

    globalDefaultsSelector.forEach((input) => {
        input.addEventListener('change', (event) => {
            console.log(event);
            const selectedValue = event.target.value;
            const selectedText = event.target.nextSibling.nodeValue;
            showPopup(`Be careful!<br>You are about to change global privacy default to:<br> ${selectedText}`, "OK");
            // vscode.postMessage({ type: "globalDefault", value: selectedValue });
        });
    });

    window.addEventListener("message", (event) => {
		const message = event.data;
		switch (message.command) {
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
                        input.checked = true;
                    }
                });
                break;
        }
    });

    function addOverride(uri, state) {
        const table = document.querySelector('.overrides__body');
        let row = document.createElement("div");
        // row.innerHTML = 'asdasd';
        row.classList.add("overrides__item");
        let path = document.createElement("div");
        path.classList.add("overrides__path");
        path.innerHTML = uri;
        row.appendChild(path);
        let selector = document.createElement("div");
        selector.classList.add("overrides__selector");
        let select = document.createElement("select");
        const options = [
            [0, "Disabled"],
            [1, "Codify only"],
            [2, "Codify & 3rd party"]
        ];
        options.forEach((element,index) => {
            let option = document.createElement("option");
            option.value = element[0];
            option.text = element[1];
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
            vscode.postMessage({ type: "deleteOverride", value: uri });
        });
        select.addEventListener("change", (event) => {
            vscode.postMessage({ type: "selectOverride", value: [uri, select.value] });
        });
        action.appendChild(button);
        row.appendChild(action);
        table.appendChild(row);
    }
    
    function showPopup(text, actionButtonText) {
        const popup = document.createElement("div");
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
        console.log(popup);

        // popup.querySelector("button").addEventListener("click", (event) => {
        //     vscode.postMessage({ type: "
        // popup.querySelector("button").addEventListener("click", (event) => {
        //     vscode.postMessage({ type: "buttonSubmit
    }
    // buttonSubmit.addEventListener("click",(event) => {
    //     let _text = document.querySelector('#comment');
    //     let _intent = _text.getAttribute('data-intent');
    //     let _funct = _text.getAttribute('data-function');
    //     let _comment = document.querySelector('#comment').value;
    //     let _source = false;
    //     const file = document.querySelector('#source');
    //     if(file && file.checked) {
    //         _source = true;
    //     }
    //     let data = {
    //         intent: _intent,
    //         function: _funct,
    //         source: _source,
    //         comment: _comment
    //     };
    //     vscode.postMessage({ type: "buttonSubmit", value: data });
    // });

})();
