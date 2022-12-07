(function () {
	const vscode = acquireVsCodeApi();
	let presets = document.querySelectorAll(".presets li");

	document.querySelector("#sidebar").addEventListener("click", (event) => {
		if (event.target && event.target.nodeName === "LI") {
			let text = event.target.innerText;
			quickInput.value = text;
			vscode.postMessage({ type: "presetSelected", value: text });
		}
	});
    
    const quickInput = document.querySelector("#quickinput");

    let listItems = document.querySelectorAll(".presets li");
    let groupItems = [];
    listItems.forEach((element,index) => {
        if(index === 0){
            groupItems.push(quickInput);
            groupItems.push(element);
        }
        else {
            groupItems.push(element);
        }
    });

    quickInput.addEventListener("keyup", ( event ) => {
        if (event.key === "Enter") {
            vscode.postMessage({ type: "quickInput", value: quickInput.value });
        }
        if(event.key === "ArrowDown") {
            let index = Array.prototype.indexOf.call(groupItems, event.target);
            if(index < groupItems.length - 1) {
                groupItems[index + 1].focus();
            }
        }
    });

    document.querySelector("#sidebar").addEventListener("keyup", (event) => {
        if(event.key === "Enter") {
            if (event.target && event.target.nodeName === "LI") {
                let text = event.target.innerText;
                quickInput.value = text;
                vscode.postMessage({ type: "presetSelected", value: text });
            }
		}
        if(event.key === "ArrowUp") {
            let index = Array.prototype.indexOf.call(groupItems, event.target);
            if(index > 0) {
                groupItems[index - 1].focus();
            }
        }
        if(event.key === "ArrowDown") {
            let index = Array.prototype.indexOf.call(groupItems, event.target);
            if(index < groupItems.length - 1) {
                groupItems[index + 1].focus();
            }
        }
	});
    

	const settingsButton = document.querySelector("#settings");
	settingsButton.addEventListener("click", () => {
		vscode.postMessage({ type: "openSettings" });
	});

    const reportButton = document.querySelector("#bug");
	reportButton.addEventListener("click", () => {
		vscode.postMessage({ type: "openBug" });
	});

	const logoutButton = document.querySelector("#logout");
    logoutButton.addEventListener("click", () => {
		vscode.postMessage({ type: "logout" });
	});

    const loginButton = document.querySelector("#login");
    loginButton.addEventListener("click", () => {
		vscode.postMessage({ type: "login" });
	});

    const refreshButton = document.querySelector(".sidebar-plan-button");
    refreshButton.addEventListener("click", () => {
		vscode.postMessage({ type: "refreshPlan" });
	});

	window.addEventListener("message", (event) => {
		const message = event.data;
		switch (message.command) {
			case "updateQuery":
				if (message.value) {
					quickInput.value = message.value;
				}
				break;
            case "getToken":
                if (message.value) {
                    token = message.value;
                }
                break;
            case "focus":
                quickInput.focus();
                break;
            case "login":
                if (message.value) {
                    let login = document.querySelector('#login');
                    login.style.display = 'none';
                    let bug = document.querySelector('#bug');
                    bug.style.display = 'block';
                    let logout = document.querySelector('#logout');
                    logout.style.display = 'block';
                    bug.style.display = 'block';
                    let info = document.querySelector('.sidebar-logged');
                    document.querySelector('.sidebar-logged span').innerHTML = message.value;
                    info.style.display = 'flex';
                }
                break;
            case "alreadyLogged":
                if (message.value) {
                    let login = document.querySelector('#login');
                    login.style.display = 'none';
                    let bug = document.querySelector('#bug');
                    bug.style.display = 'block';
                    let logout = document.querySelector('#logout');
                    logout.style.display = 'block';
                    bug.style.display = 'block';
                    let info = document.querySelector('.sidebar-logged');
                    document.querySelector('.sidebar-logged span').innerHTML = message.value;
                    info.style.display = 'flex';
                }
                break;
            case "logout":
                    let login = document.querySelector('#login');
                    login.style.display = 'block';
                    let bug = document.querySelector('#bug');
                    bug.style.display = 'none';
                    let logout = document.querySelector('#logout');
                    logout.style.display = 'none';
                    bug.style.display = 'none';
                    let info = document.querySelector('.sidebar-logged');
                    document.querySelector('.sidebar-logged span').innerHTML = '';
                    info.style.display = 'none';
                    break;
			case "updateHistory":
				if (message.value && message.value.length > 0) {
					let historyTitle = document.querySelector(".history-title");
					let historyList = document.querySelector(".history");
					historyTitle.style.display = "block";
					historyList.style.display = "block";
					let data = message.value.reverse();
					historyList.innerHTML = "";
					for (let i = 0; i < 5; i++) {
						if (data[i]) {
							let historyItem = `<li>${data[i]}</li>`;
							historyList.innerHTML += historyItem;
						}
					}
				}
				break;
		}
	});
})();
