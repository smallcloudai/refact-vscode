(function () {
	const vscode = acquireVsCodeApi();
	// let presets = document.querySelectorAll(".presets li");

    const sidebar = document.querySelector("#sidebar");

    sidebar.addEventListener("click", (event) => {
        if (event.target && event.target.matches("li")) {
            console.log(event.target.id);
            vscode.postMessage({ 
                type: "presetSelected", 
                value: event.target.innerHTML, 
                id: event.target.id, 
                class: event.target.className,
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
        for (const [k, v] of Object.entries(functions)) {
            classes = "";
            classes += "longthink";
            if ("selection-required" in v && v["selection-required"] === true) {
                classes += " selection-required";
            }

            let child = document.createElement("li");
            child.innerHTML = v.label;
            child.id = k;
            child.className = classes;
            child.dataset.function = JSON.stringify(v);
            yield child;
        }
    }

	window.addEventListener("message", (event) => {
        console.log("message -->", event.message);
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
            
            tpHeader.style.display = message.ts2web_user ? 'block' : 'none';
            tpList.style.display = message.ts2web_user ? 'block' : 'none';
            
            if (message.longthink_functions) {
                tpList.innerHTML = '';
                for (const h of longthinkToHtml(message.longthink_functions)) {
                    tpList.appendChild(h);
                }
            }            
            break;
		}
	});
})();
