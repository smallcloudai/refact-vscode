(function () {
	const vscode = acquireVsCodeApi();
	// let presets = document.querySelectorAll(".presets li");

    const sidebar = document.querySelector("#sidebar");

    sidebar.addEventListener("click", (event) => {
        if (event.target && event.target.parentElement.matches("li")) {
            if(event.target.classList.contains('muted')) { return; };
            console.log(event.target.id);
            vscode.postMessage({ 
                type: "presetSelected", 
                value: event.target.innerHTML, 
                id: event.target.id, 
                data_function: event.target.dataset.function,
            });
        }
    });

    // const quickInput = document.querySelector("#quickinput");

    // let listItems = document.querySelectorAll(".presets li");
    // let groupItems = [];
    // listItems.forEach((element,index) => {
    //     if(index === 0){
    //         groupItems.push(quickInput);
    //         groupItems.push(element);
    //     }
    //     else {
    //         groupItems.push(element);
    //     }
    // });

    // quickInput.addEventListener("keyup", ( event ) => {
    //     if (event.key === "Enter") {
    //         vscode.postMessage({ type: "quickInput", value: quickInput.value });
    //     }
    //     if(event.key === "ArrowDown") {
    //         let index = Array.prototype.indexOf.call(groupItems, event.target);
    //         if(index < groupItems.length - 1) {
    //             groupItems[index + 1].focus();
    //         }
    //     }
    // });

    // document.querySelector("#sidebar").addEventListener("keyup", (event) => {
    //     if(event.key === "Enter") {
    //         if (event.target && event.target.nodeName === "LI") {
    //             let text = event.target.innerText;
    //             quickInput.value = text;
    //             vscode.postMessage({ type: "presetSelected", value: text });
    //         }
	// 	}
    //     if(event.key === "ArrowUp") {
    //         let index = Array.prototype.indexOf.call(groupItems, event.target);
    //         if(index > 0) {
    //             groupItems[index - 1].focus();
    //         }
    //     }
    //     if(event.key === "ArrowDown") {
    //         let index = Array.prototype.indexOf.call(groupItems, event.target);
    //         if(index < groupItems.length - 1) {
    //             groupItems[index + 1].focus();
    //         }
    //     }
	// });


	const settingsButton = document.querySelector("#settings");
	settingsButton.addEventListener("click", () => {
		vscode.postMessage({ type: "openSettings" });
	});

    const profileButton = document.querySelector("#profile");
	profileButton.addEventListener("click", () => {
		vscode.postMessage({ type: "js2ts_goto_profile" });
	});

    const dataButton = document.querySelector("#datacollection");
	dataButton.addEventListener("click", () => {
		vscode.postMessage({ type: "js2ts_goto_datacollection" });
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
		vscode.postMessage({ type: "js2ts_refresh_login" });
	});

    function* longthinkToHtml(functions)
    {
        for (const f of functions) {
            k = f[0];
            v = f[1];

            let child = document.createElement("li");
            child.innerHTML = v.label;
            child.dataset.function = JSON.stringify(v);
            child.id = k;
            yield child;
        }
    }

	window.addEventListener("message", (event) => {
		const message = event.data;
		switch (message.command) {
        // case "focus":
        //     quickInput.focus();
        //     break;

        case "ts2web":
            let info = document.querySelector('.sidebar-logged');
            let plan = document.querySelector('.sidebar-plan');
            let login = document.querySelector('#login');
            let profile = document.querySelector('#profile');
            let data = document.querySelector('#datacollection');
            let logout = document.querySelector('#logout');

            let regHeader = document.querySelector('#regular-header');
            let regList = document.querySelector('#regular-list');
            let tpHeader = document.querySelector('#third-party-header');
            let tpList = document.querySelector('#third-party-list');
    
            info.style.display = message.ts2web_user ? 'flex' : '';
            plan.style.display = message.ts2web_plan ? 'flex' : '';
            document.querySelector('.sidebar-logged span').innerHTML = message.ts2web_user;
            document.querySelector('.sidebar-plan span').innerHTML = message.ts2web_plan;
            login.style.display = message.ts2web_user ? 'none' : 'block';
            profile.style.display = message.ts2web_user ? 'block' : 'none';
            logout.style.display = message.ts2web_user ? 'block' : 'none';
            data.style.display = message.ts2web_user ? 'block' : 'none';
            
            regHeader.style.display = 'none';
            regList.style.display = 'none';
            tpHeader.style.display = 'none';
            tpList.style.display = 'none';
            
            if (message.longthink_functions) {
                reg_functions = Object.entries(message.longthink_functions).filter(([, v]) => v['metering'] === 0);
                tp_functions = Object.entries(message.longthink_functions).filter(([, v]) => v['metering'] > 0);

                if (reg_functions) {
                    regHeader.style.display = 'block';
                    regList.style.display = 'block';
                    regList.innerHTML = '';
                    for (const h of longthinkToHtml(reg_functions)) {
                        regList.appendChild(h);
                    }
                }
                if (tp_functions) {
                    tpHeader.style.display = 'block';
                    tpList.style.display = 'block';        
                    tpList.innerHTML = '';
                    for (const h of longthinkToHtml(tp_functions)) {
                        tpList.appendChild(h);
                    }
                }
            }            
            break;
		}
	});
})();
