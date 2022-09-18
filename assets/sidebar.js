(function () {
	const vscode = acquireVsCodeApi();
	let presets = document.querySelectorAll(".presets li");
    // let token = 'r2kv3sxwj9e-3glml41tuzp';

	document.querySelector("#sidebar").addEventListener("click", (event) => {
		if (event.target && event.target.nodeName === "LI") {
			let text = event.target.innerText;
			quickInput.value = text;
			vscode.postMessage({ type: "presetSelected", value: text });
		}
	});

	const quickInput = document.querySelector("#quickinput");
	quickInput.addEventListener("keyup", ({ key }) => {
		if (key === "Enter") {
			vscode.postMessage({ type: "quickInput", value: quickInput.value });
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
	const loginButton = document.querySelector("#login");
	// loginButton.addEventListener("click", () => {
    //     vscode.postMessage({ type: "runLogin" });
	// });

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
            case "login":
                if (message.value) {
                    let login = document.querySelector('#login');
                    login.style.display = 'none'; 
                    let bug = document.querySelector('#bug');
                    bug.style.display = 'block'; 
                    let logout = document.querySelector('#logout');
                    bug.style.display = 'block'; 
                    let info = document.querySelector('.sidebar-logged');
                    document.querySelector('.sidebar-logged span').innerHTML = message.value;
                    info.style.display = 'block'; 
                }
                break;
            case "alreadyLogged":
                if (message.value) {
                    let login = document.querySelector('#login');
                    login.style.display = 'none'; 
                    let bug = document.querySelector('#bug');
                    bug.style.display = 'block'; 
                    let logout = document.querySelector('#logout');
                    bug.style.display = 'block'; 
                    let info = document.querySelector('.sidebar-logged');
                    document.querySelector('.sidebar-logged span').innerHTML = message.value;
                    info.style.display = 'block'; 
                }
                break;
            case "logout":
                    if (message.value) {
                        let login = document.querySelector('#login');
                        login.style.display = 'block'; 
                        let bug = document.querySelector('#bug');
                        bug.style.display = 'none'; 
                        let logout = document.querySelector('#logout');
                        bug.style.display = 'none'; 
                        let info = document.querySelector('.sidebar-logged');
                        document.querySelector('.sidebar-logged span').innerHTML = '';
                        info.style.display = 'none'; 
                    }
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
