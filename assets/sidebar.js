/* eslint-disable @typescript-eslint/naming-convention */
(function () {
	const vscode = acquireVsCodeApi();
	// let presets = document.querySelectorAll(".presets li");

    const data = [
        {
            'explain-error': {
                'model':'longthink/experimental',
                'label':'Explain Error',
                'selected_lines_min':1,
                'selected_lines_max':10,
                'metering':1,
                'always_visible':false,
                'third_party':true,
                'supports_highlight':false,
                'supports_selection':true,
                'content': "<img src=\"https://inverezh.com/1.gif \"/>\n<div>\n    <p>Boost your productivity by employing AI to pair program with you or make more fun out of your work by delegating boring tasks to the AI.</p>\n    <p><strong>Code Completion:</strong> satisfying, smart and relevant code completion that can suggest whole functions or classes. It suggests commonly used programming patterns, libraries and APIs usage, and helps with typing. This helps you write code faster and with fewer errors.</p>\n    <p><strong>Code Transformation:</strong> use natural language commands to ask the AI to search, transform, or optimize your code. Whether you're looking to optimize, search, or refactor your code, Codify has you covered.</p>\n    <p><strong>Privacy of your code guaranteed:</strong> Codify allows you to restrict access to particular files or projects, ensuring that your private code or confidential files are protected. And we never store your code on the server side.</p>\n    <p><strong>User-Friendly Interface:</strong> Codify has a simple, user-friendly interface that makes it easy to use, even for those new to AI tools. Codify will assist by completing your code or by accessing the AI toolbox function (use F1 to open).</p>\n    <p><strong>It's fast!</strong> And supports Python, Java, PHP, C++, Javascript, TypeScript and 20 more programming languages.</p>\n    <p>Codify is a cutting-edge AI tool designed to assist developers in writing and refining code.\n    Whether you're working on a brand new project or modifying existing code, Codify can help you save time and streamline your coding process.</p>\n</div>",
                'likes': 0
            }
        },
        {
            'make-code-shorter': {
                'model':'longthink/experimental',
                'label':'Make code shorter',
                'selected_lines_min':1,
                'selected_lines_max':10,
                'metering':1,
                'always_visible':false,
                'third_party':true,
                'supports_highlight':false,
                'supports_selection':true,
                'content': "<img src=\"https://inverezh.com/2.gif \"/>\n<div>\n    <p>Boost your productivity by employing AI to pair program with you or make more fun out of your work by delegating boring tasks to the AI.</p>\n    <p><strong>Code Completion:</strong> satisfying, smart and relevant code completion that can suggest whole functions or classes. It suggests commonly used programming patterns, libraries and APIs usage, and helps with typing. This helps you write code faster and with fewer errors.</p>\n    <p><strong>Code Transformation:</strong> use natural language commands to ask the AI to search, transform, or optimize your code. Whether you're looking to optimize, search, or refactor your code, Codify has you covered.</p>\n    <p><strong>Privacy of your code guaranteed:</strong> Codify allows you to restrict access to particular files or projects, ensuring that your private code or confidential files are protected. And we never store your code on the server side.</p>\n    <p><strong>User-Friendly Interface:</strong> Codify has a simple, user-friendly interface that makes it easy to use, even for those new to AI tools. Codify will assist by completing your code or by accessing the AI toolbox function (use F1 to open).</p>\n    <p><strong>It's fast!</strong> And supports Python, Java, PHP, C++, Javascript, TypeScript and 20 more programming languages.</p>\n    <p>Codify is a cutting-edge AI tool designed to assist developers in writing and refining code.\n    Whether you're working on a brand new project or modifying existing code, Codify can help you save time and streamline your coding process.</p>\n</div>",
                'likes': 10
            }
        },
        {
            'highlight': {
                'model':'longthink/experimental',
                'label':'Highlight',
                'selected_lines_min':1,
                'selected_lines_max':10,
                'metering':1,
                'third_party':false,
                'always_visible':true,
                'supports_highlight':true,
                'supports_selection':true,
                'content': "<img src=\"https://inverezh.com/3.gif \"/>\n<div>\n    <p>Boost your productivity by employing AI to pair program with you or make more fun out of your work by delegating boring tasks to the AI.</p>\n    <p><strong>Code Completion:</strong> satisfying, smart and relevant code completion that can suggest whole functions or classes. It suggests commonly used programming patterns, libraries and APIs usage, and helps with typing. This helps you write code faster and with fewer errors.</p>\n    <p><strong>Code Transformation:</strong> use natural language commands to ask the AI to search, transform, or optimize your code. Whether you're looking to optimize, search, or refactor your code, Codify has you covered.</p>\n    <p><strong>Privacy of your code guaranteed:</strong> Codify allows you to restrict access to particular files or projects, ensuring that your private code or confidential files are protected. And we never store your code on the server side.</p>\n    <p><strong>User-Friendly Interface:</strong> Codify has a simple, user-friendly interface that makes it easy to use, even for those new to AI tools. Codify will assist by completing your code or by accessing the AI toolbox function (use F1 to open).</p>\n    <p><strong>It's fast!</strong> And supports Python, Java, PHP, C++, Javascript, TypeScript and 20 more programming languages.</p>\n    <p>Codify is a cutting-edge AI tool designed to assist developers in writing and refining code.\n    Whether you're working on a brand new project or modifying existing code, Codify can help you save time and streamline your coding process.</p>\n</div>",
                'likes': 10
                
            }
        },
        {
            'fix': {
                'model':'longthink/experimental',
                'label':'Fix',
                'selected_lines_min':1,
                'selected_lines_max':10,
                'metering':1,
                'third_party':false,
                'always_visible':true,
                'supports_highlight':false,
                'supports_selection':true,
                'content': "<img src=\"https://inverezh.com/1.gif \"/>\n<div>\n    <p>Boost your productivity by employing AI to pair program with you or make more fun out of your work by delegating boring tasks to the AI.</p>\n    <p><strong>Code Completion:</strong> satisfying, smart and relevant code completion that can suggest whole functions or classes. It suggests commonly used programming patterns, libraries and APIs usage, and helps with typing. This helps you write code faster and with fewer errors.</p>\n    <p><strong>Code Transformation:</strong> use natural language commands to ask the AI to search, transform, or optimize your code. Whether you're looking to optimize, search, or refactor your code, Codify has you covered.</p>\n    <p><strong>Privacy of your code guaranteed:</strong> Codify allows you to restrict access to particular files or projects, ensuring that your private code or confidential files are protected. And we never store your code on the server side.</p>\n    <p><strong>User-Friendly Interface:</strong> Codify has a simple, user-friendly interface that makes it easy to use, even for those new to AI tools. Codify will assist by completing your code or by accessing the AI toolbox function (use F1 to open).</p>\n    <p><strong>It's fast!</strong> And supports Python, Java, PHP, C++, Javascript, TypeScript and 20 more programming languages.</p>\n    <p>Codify is a cutting-edge AI tool designed to assist developers in writing and refining code.\n    Whether you're working on a brand new project or modifying existing code, Codify can help you save time and streamline your coding process.</p>\n</div>",
                'likes': 0
            }
        }
    ];

    const sidebar = document.querySelector("#sidebar");
    const toolboxSearch = document.querySelector("#toolbox-search");
    const toolboxList = document.querySelector(".toolbox-list");

    toolboxSearch.addEventListener("keyup", ( event ) => {
        if (event.key === "Enter") {
            console.log('Toolbox Enter',event);
            // vscode.postMessage({ type: "quickInput", value: quickInput.value });
        }
        if(event.key === "ArrowDown") {
            // let index = Array.prototype.indexOf.call(toolboxItems, event.target);
            // console.log('Toolbox ArrowDown',index);
            // if(index < toolboxItems.length - 1) {
            //     toolboxItems[index + 1].focus();
            // }
        }
        if(event.key === "ArrowUp") {
            let index = Array.prototype.indexOf.call(toolboxItems, event.target);
            if(index < toolboxItems.length - 1) {
                toolboxItems[index - 1].focus();
            }
        }
    });

    toolboxList.addEventListener("click", (event) => {
        if (event.target && event.target.classList.contains("toolbox-item")) {
        //     if(event.target.parentElement.classList.contains('muted')) { return; };
        //     console.log(event.target.id);
            vscode.postMessage({ 
                type: "presetSelected", 
                value: event.target.dataset.function, 
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

    // toolboxSearch.addEventListener("keyup", ( event ) => {
    //     if (event.key === "Enter") {
    //         // vscode.postMessage({ type: "quickInput", value: quickInput.value });
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

    function renderToolbox(data) {  
        for(const item of data) {
            Object.values(item).forEach(function(item) {
                const toolboxItem = document.createElement("div");
                const header = document.createElement("div");
                const body = document.createElement("div");
                const likes = document.createElement("div");
    
                toolboxItem.classList.add("toolbox-item");
                if(!item.always_visible) {
                    toolboxItem.classList.add("toolbox-filter");
                }
                else {
                    toolboxItem.classList.add("toolbox-static");
                }
                header.classList.add("toolbox-header");
                likes.classList.add("toolbox-likes");
                body.classList.add("toolbox-body");
                
                header.innerHTML = item.label;
                toolboxItem.id = Object.keys(item)[0];
                toolboxItem.dataset.title = item.label;
                toolboxItem.dataset.function = Object.keys(item)[0];
                likes.innerHTML = item.likes;
                body.innerHTML = item.content;
    
                header.appendChild(likes);
                toolboxItem.appendChild(header);
                toolboxItem.appendChild(body);
                toolboxList.appendChild(toolboxItem);
            });
        }
    }
    renderToolbox(data);
    const toolboxItems = document.querySelectorAll(".toolbox-item");
    toolboxItems[0].classList.add("item-active");
    toolboxItems.forEach((item) => {
        item.addEventListener("mouseover", (toolbox) => {
            document.querySelector(".item-active").classList.remove("item-active");
            item.classList.add("item-active");
            // item.querySelector('.toolbox-body').scrollTop = 0;
        });
    });

    const filterItems = document.querySelectorAll(".toolbox-filter");
    toolboxSearch.addEventListener('input', function() {
        let currentActive = document.querySelectorAll(".item-active");
        if(currentActive.length > 0) {
            currentActive.forEach(function(item) {
                item.classList.remove("item-active");
            });
        }
        const searchTerm = this.value.toLowerCase();
        const itemsArray = Array.from(filterItems);
        const filteredDivs = itemsArray.filter(div => {
            return div.dataset.title.toLowerCase().includes(searchTerm);
        });
        filterItems.forEach(div => div.style.display = 'none');
        filteredDivs.forEach(div => div.style.display = 'block');
        if(filteredDivs.length === 0) {
            // console.log('asdasd',document.querySelectorAll(".toolbox-static"));
            document.querySelector(".toolbox-static").classList.add("item-active");
        }
        else {
            filteredDivs[0].classList.add("item-active");  
        }
    });


    // function toolboxItemsToHtml(functions)
    // {
    //     for (const f of functions) {
    //         k = f[0];
    //         v = f[1];

    //         let child = document.createElement("div");
    //         child.innerHTML = v.label;
    //         child.dataset.function = JSON.stringify(v);
    //         child.id = k;
    //         yield child;
    //     }
    // }

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
            
            // regHeader.style.display = 'none';
            // regList.style.display = 'none';
            // tpHeader.style.display = 'none';
            // tpList.style.display = 'none';
            
            // if (message.longthink_functions) {
            //     reg_functions = Object.entries(message.longthink_functions).filter(([, v]) => v['metering'] === 0);
            //     tp_functions = Object.entries(message.longthink_functions).filter(([, v]) => v['metering'] > 0);

            //     if (reg_functions) {
            //         regHeader.style.display = 'block';
            //         regList.style.display = 'block';
            //         regList.innerHTML = '';
            //         for (const h of longthinkToHtml(reg_functions)) {
            //             regList.appendChild(h);
            //         }
            //     }
            //     if (tp_functions) {
            //         tpHeader.style.display = 'block';
            //         tpList.style.display = 'block';        
            //         tpList.innerHTML = '';
            //         for (const h of longthinkToHtml(tp_functions)) {
            //             tpList.appendChild(h);
            //         }
            //     }
            // }            
            break;
		}
	});
})();
