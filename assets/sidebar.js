/* eslint-disable @typescript-eslint/naming-convention */
(function () {
	const vscode = acquireVsCodeApi();
	// let presets = document.querySelectorAll(".presets li");
    const sidebar = document.querySelector("#sidebar");
    const toolbox = document.querySelector(".toolbox");
    const toolboxSearch = document.querySelector("#toolbox-search");
    const toolboxList = document.querySelector(".toolbox-list");
    const toolboxRun = document.querySelector(".toolbox-run");
    let toolboxIndex = 0;
    let longthink_functions_today;
    let editor_selection = false;

    toolboxSearch.addEventListener("keyup", ( event ) => {
        if(event.target.value !== '') {
            toolboxRun.classList.remove("toolbox-run-disabled");
        }
        else {
            toolboxRun.classList.add("toolbox-run-disabled");
        }
        if (event.key === "Enter") {   
            vscode.postMessage({ type: "checkSelectionDefault", intent: event.target.value});
        }
        if(event.key === "ArrowDown") {
            const firstBlockChild = Array.from(toolboxList.childNodes).find(child => {
                return child.style.display !== 'none';
            });
            if(firstBlockChild) {
                toolboxSearch.blur();
                firstBlockChild.focus();
                firstBlockChild.classList.add('item-selected');
                toolboxSearch.value = firstBlockChild.dataset.title;
            }
            // let index = Array.prototype.indexOf.call(toolboxItems, event.target);
            // if(index < toolboxItems.length - 1) {
            //     toolboxItems[index + 1].focus();
            // }
        }
        if(event.key === "ArrowUp") {
            // history
            // let index = Array.prototype.indexOf.call(toolboxItems, event.target);
            // if(index < toolboxItems.length - 1) {
            //     toolboxItems[index - 1].focus();
            // }
        }
    });

    toolboxRun.addEventListener("click", ( event ) => {
            const current = document.querySelector(".item-active");
            if(current) {
                console.log('Toolbox Run',current);
                const item_functions = longthink_functions_today[current.id];
                vscode.postMessage({ 
                    type: "presetSelected", 
                    value: JSON.stringify(item_functions.label), 
                    id: current.id, 
                    data_function: JSON.stringify(item_functions),
                });
            }
            else {
                if(toolboxSearch.value !== '') {
                    vscode.postMessage({ type: "checkSelectionDefault", intent: toolboxSearch.value});
                }
            }
    });

    toolboxList.addEventListener("click", (event) => {
        if (event.target && event.target.classList.contains("toolbox-item")) {
        //     if(event.target.parentElement.classList.contains('muted')) { return; };
        //     console.log(event.target.id);
            // vscode.postMessage({ 
            //     type: "presetSelected", 
            //     value: event.target.dataset.function, 
            //     id: event.target.id, 
            //     data_function: event.target.dataset.function,
            // });
        }
        if (event.target && event.target.classList.contains("toolbox-back")) {
            let active = document.querySelector(".item-active");
            document.querySelector(".item-active .toolbox-notice").classList.remove('toolbox-notice-hidden');
            if(active) {
                toolboxSearch.value = '';
                active.classList.remove("item-active");
                toolboxRun.classList.add("toolbox-run-disabled");
            }
        }
    });

    toolbox.addEventListener("keyup",(event) => {
        if(event.key === "ArrowUp") {
            if (event.target && event.target.classList.contains("toolbox-item")) {
                event.target.blur();
                toolboxItems[toolboxIndex - 1].focus();
            }
        }
        if(event.key === "ArrowDown") {
            if (event.target && event.target.classList.contains("toolbox-item")) {
                event.target.blur();
                toolboxItems[toolboxIndex + 1].focus();
            }
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

    function check_bookmarked_functions(data) {
        const keys = Object.keys(data);
        keys.forEach((key) => {
            let bookmark = {};
            if(key === 'staging-explain-code' || key === 'staging-make-code-shorter') {
                bookmark = {
                    ...data[key],
                    'is_bookmarked': true
                }; 
            }
            else {
                bookmark = {
                    ...data[key],
                    'is_bookmarked': false
                };
            }
            data[key] = bookmark;
        });
        return data;
    }

    // renderToolbox(data);
    function renderToolbox(data) {
        const bookmarked = check_bookmarked_functions(data);
        const sortedData = Object.entries(data)
        .sort(([, a], [, b]) => {
            if (a.is_bookmarked !== b.is_bookmarked) {
            return a.is_bookmarked ? -1 : 1; // bookmarked
            } else if (a.always_visible !== b.always_visible) {
            return a.always_visible ? 1 : -1; // always_visible
            } else {
            return b.likes - a.likes; // likes
            }
        })
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
        const keys = Object.keys(sortedData);
        toolboxList.innerHTML = '';
        keys.forEach((key) => {
            let item = data[key];
            const toolboxItem = document.createElement("div");
            const header = document.createElement("div");
            const body = document.createElement("div");
            const likes = document.createElement("div");
            const backButton = document.createElement('button');
            const content = document.createElement("div");
            const bookmark = document.createElement("div");
            const likes_span = document.createElement("span");
            const likes_icon = document.createElement("i");
            const bookmark_icon = document.createElement("i");
            const body_controls = document.createElement("div");
            const label_wrapper = document.createElement("span");
            const selection_notice = document.createElement("div");

            toolboxItem.classList.add("toolbox-item");
            if(item.catch_all_hl === 0 && item.catch_all_selection === 0) {
                toolboxItem.classList.add("toolbox-filter");
            }
            else {
                toolboxItem.classList.add("toolbox-static");
            }
            header.classList.add("toolbox-header");
            likes.classList.add("toolbox-likes");
            if(item.is_liked > 0) {
                likes_icon.classList.add("toolbox-like-checked");
            } else {
                likes_icon.classList.add("toolbox-like-unchecked");
            }
            if(item.is_bookmarked) {
                bookmark_icon.classList.add("toolbox-bookmark-checked");
            } else {
                bookmark_icon.classList.add("toolbox-bookmark-unchecked");
            }
            body.classList.add("toolbox-body");
            bookmark.classList.add("toolbox-bookmark");
            backButton.classList.add('toolbox-back');
            body_controls.classList.add('toolbox-controls');
            selection_notice.classList.add('toolbox-notice');
            selection_notice.innerHTML = `Please select code to run this function.`;
            label_wrapper.innerHTML = item.label;
            header.appendChild(label_wrapper);
            toolboxItem.id = key;
            toolboxItem.dataset.title = item.label;
            toolboxItem.dataset.function = JSON.stringify(item);
            likes_span.innerHTML = item.likes;
            content.innerHTML = item.mini_html;
            backButton.innerText = '← Back';
            likes.appendChild(likes_icon);
            likes.appendChild(likes_span);
            bookmark.appendChild(bookmark_icon);
            let likes2 = likes.cloneNode(true);
            let bookmark2 = bookmark.cloneNode(true);
            header.appendChild(likes);
            header.appendChild(bookmark);
            body_controls.appendChild(likes2);
            body_controls.appendChild(bookmark2);
            body.appendChild(backButton);
            body.appendChild(selection_notice);
            body.appendChild(body_controls);
            body.appendChild(content);
            toolboxItem.appendChild(header);
            toolboxItem.appendChild(body);
            toolboxList.appendChild(toolboxItem);
        });
    }

    function search_filter() {
        const filterItems = document.querySelectorAll(".toolbox-filter");
        toolboxSearch.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const itemsArray = Array.from(filterItems);
            const filteredDivs = itemsArray.filter(div => {
                return div.dataset.title.toLowerCase().includes(searchTerm);
            });
            filterItems.forEach(div => div.style.display = 'none');
            filteredDivs.forEach(div => div.style.display = 'block');
        });
    }

    function command_handler(command) {
        const toolboxItems = document.querySelectorAll(".toolbox-item");
        toolboxItems.forEach((item) => {
            item.addEventListener("click", (event) => {
                if(event.target.tagName === 'SPAN') {
                    let active = document.querySelector(".item-active");
                    if(active) {
                        active.classList.remove("item-active");
                    }
                    item.classList.add("item-active");
                    toolboxSearch.value = item.dataset.title;
                    const item_name = item.id;
                    const item_functions = longthink_functions_today[item_name];
                    if(item_functions.supports_highlight === 1) {
                        toolboxRun.classList.remove("toolbox-run-disabled");
                        document.querySelector(".item-active .toolbox-notice").classList.add('toolbox-notice-hidden');
                    } else if(item_functions.supports_selection === 1) {
                        vscode.postMessage({ type: "checkSelection"});
                    }
                    // console.log(longthink_functions_today[item_name]);
                }
            });
        });
    }


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
        case "selectionDefault":
            const keys = Object.keys(longthink_functions_today);
            let result = keys.find(obj => longthink_functions_today[obj].catch_all_hl === 1);
            if(message.value) {
                result = keys.find(obj => longthink_functions_today[obj].catch_all_selection === 1);
            }
            vscode.postMessage({ 
                type: "presetSelected", 
                value: message.intent, 
                id: 'intent', 
                data_function: JSON.stringify(result),
            });
        case "selection":
            editor_selection = message.value;
            if(editor_selection) {
                toolboxRun.classList.remove("toolbox-run-disabled");
                let notice = document.querySelector(".item-active .toolbox-notice");
                if(notice) {
                    notice.classList.add('toolbox-notice-hidden');
                }
            }
            break;
        case "focus":
            toolboxSearch.focus();
            break;

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
            
            if (message.longthink_functions) {
                console.log(message.longthink_functions);
                longthink_functions_today = message.longthink_functions;
                renderToolbox(message.longthink_functions);
                search_filter();
                command_handler();
                // reg_functions = Object.entries(message.longthink_functions).filter(([, v]) => v['metering'] === 0);
                // tp_functions = Object.entries(message.longthink_functions).filter(([, v]) => v['metering'] > 0);

                // if (reg_functions) {
                //     regHeader.style.display = 'block';
                //     regList.style.display = 'block';
                //     regList.innerHTML = '';
                //     for (const h of longthinkToHtml(reg_functions)) {
                //         regList.appendChild(h);
                //     }
                // }
                // if (tp_functions) {
                //     tpHeader.style.display = 'block';
                //     tpList.style.display = 'block';        
                //     tpList.innerHTML = '';
                //     for (const h of longthinkToHtml(tp_functions)) {
                //         tpList.appendChild(h);
                //     }
                // }
            }            
            break;
		}
	});
})();
