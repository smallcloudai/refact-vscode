/* eslint-disable @typescript-eslint/naming-convention */
function sidebar_general_script(vscode) {
    // let presets = document.querySelectorAll(".presets li");
    const body = document.querySelector("body");
    const sidebar = document.querySelector("#sidebar");
    // const toolbox = document.querySelector(".toolbox");
    // const toolboxSearch = document.querySelector("#toolbox-search");
    // const toolboxList = document.querySelector(".toolbox-list");
    let longthink_filters;
    // let editor_inform_how_many_lines_selected = 0;
    // let editor_inform_file_access_level = 0;
    let function_bookmarks = [];

    // toolboxSearch.addEventListener("focus", (event) => {
    //     on_how_many_lines_selected();
    // });

    const welcome_selects = document.querySelectorAll(".refact-welcome__select");
    welcome_selects.forEach((select) => {
        select.addEventListener("click", () => {
            welcome_selects.forEach((other_select) => {
                other_select.classList.remove('refact-welcome__select--selected');
                other_select.querySelector('.refact-welcome__radio').checked = false;
            });
            select.classList.add('refact-welcome__select--selected');
            select.querySelector('.refact-welcome__radio').checked = true;
        });
    });

    const welcome_next_button = document.querySelector('.refact-welcome__next');
    welcome_next_button.addEventListener("click", () => {
        const selection_type = document.querySelector('.refact-welcome__select--selected').querySelector('.refact-welcome__radio').value;
        change_welcome_subscreen(selection_type);
    });

    const telemetry_optin = document.querySelector('#telemetrycode');
    telemetry_optin && telemetry_optin.addEventListener('change',()=> {
        vscode.postMessage({
            type: "save_telemetry_settings",
            code: document.querySelector('.refact-welcome__telemetrycode').checked
        });
    });
    const next_button_refact = document.querySelector('.refact-welcome__next_refact');
    next_button_refact.addEventListener("click", () => {
        const enter_apikey = document.querySelector('.refact-welcome__apikey_refact');
        const error_message = document.querySelector('.refact-welcome__error-refact');
        if (enter_apikey.value && enter_apikey.value !== '') {
            enter_apikey.style.borderColor = 'var(--secondary)';
            error_message.style.display = 'none';
            vscode.postMessage({
                type: "button_refact_save",
                refact_api_key: enter_apikey.value,
            });
        } else {
            enter_apikey.style.borderColor = 'var(--vscode-editorError-foreground)';
            error_message.style.display = 'block';
        }
    });

    const selfhosting_input = document.querySelector('.refact-welcome__endpoint');
    selfhosting_input.addEventListener("change",() => {
        if(selfhosting_input.value === '') {
            selfhosting_input.value = 'http://127.0.0.1:8008';
        }
    });

    function change_provider_subscreen(selection_type) {
        const screens = document.querySelectorAll(".refact-welcome__subscreen");
        screens.forEach((screen) => {
            screen.classList.remove('refact-welcome__subscreen--selected');
        });
        switch (selection_type) {
            case "refact":
                document.querySelector('[data-provider="refact"]').classList.toggle('refact-welcome__subpanel--selected');
                break;
            case "huggingface":
                document.querySelector('[data-provider="huggingface"]').classList.toggle('refact-welcome__subpanel--selected');
                break;
        }
    }

    function reset_everything_about_commands() {
        current_history = 0;
        command_mode = false;
        history_mode = false;
        let active = document.querySelector(".item-selected");
        if (active) {
            active.classList.remove("item-selected");
        }
    }

    function change_welcome_subscreen(selection_type) {
        document.querySelector('.refact-welcome__menu').style.display = "none";
        switch (selection_type) {
            case "enterprise":
                document.querySelector('.refact-welcome__enterprise').classList.toggle('refact-welcome__subscreen--selected');
                break;
            case "personal":
                document.querySelector('.refact-welcome__personal').classList.toggle('refact-welcome__subscreen--selected');
                break;
            case "self-hosting":
                document.querySelector('.refact-welcome__selfhosted').classList.toggle('refact-welcome__subscreen--selected');
                break;
        }
    }

    const save_selfhosted = document.querySelector('.refact-welcome__savebutton--selfhosted');
    save_selfhosted.addEventListener("click", () => {
        const endpoint = document.querySelector('.refact-welcome__endpoint');
        vscode.postMessage({
            type: "save_selfhosted",
            endpoint: endpoint.value,
        });
    });

    const save_enterprise = document.querySelector('.refact-welcome__savebutton--enterprise');
    save_enterprise.addEventListener("click", () => {
        const enter_endpoint = document.querySelector('.refact-welcome__enterendpoint');
        const enter_apikey = document.querySelector('.refact-welcome__apikey_enterprise');
        const error_message = document.querySelector('.refact-welcome__error-enterprise');
        if (enter_apikey.value && enter_apikey.value !== '') {
            enter_apikey.style.borderColor = 'var(--secondary)';
            error_message.style.display = 'none';
            vscode.postMessage({
                type: "save_enterprise",
                endpoint: enter_endpoint.value,
                apikey: enter_apikey.value,
            });
        } else {
            enter_apikey.style.borderColor = 'var(--vscode-editorError-foreground)';
            error_message.style.display = 'block';
        }
    });

    const button_refact = document.querySelector('.refact-welcome__refact');
    const api_input = document.querySelector('.refact-welcome__apikey_refact');
    button_refact.addEventListener("click", () => {
        start_input_animation();
        vscode.postMessage({
            type: "button_refact_open_streamlined",
        });
    });

    let timer_started = false;
    function start_input_animation() {
        const loading_text = 'Fetching API Key ';
        const animation_frames = ['/', '|', '\\', '-'];
        let index = 0;

        function update_placeholder() {
          const frame = animation_frames[index];
          api_input.placeholder = ` ${loading_text} ${frame} `;
          index = (index + 1) % animation_frames.length;
        }

        if(!timer_started) {
            api_input.loading_interval = setInterval(update_placeholder, 100);
            setTimeout(stop_input_animation, 30000);
            timer_started = true;
        }
    }

    function stop_input_animation() {
        clearInterval(api_input.loading_interval);
        api_input.placeholder = '';
        timer_started = false;
    }

    // body.addEventListener("keyup", (event) => {
    //     event.preventDefault();
    //     if (event.key === "Enter") {
    //         let selected_in_list = document.querySelector(".item-selected");  // one in list, always present
    //         let single_page = document.querySelector(".item-active");  // single page
    //         if (toolboxSearch.value.endsWith("?")) {
    //             let intent = toolboxSearch.value;
    //             vscode.postMessage({ type: "open_new_chat", question: intent, chat_empty: false, chat_model: "" });
    //         }
    //         else if (single_page) {
    //             let intent = toolboxSearch.value;
    //             history.splice(0, 0, intent);
    //             vscode.postMessage({
    //                 type: "function_activated",
    //                 intent: intent,
    //                 data_function: active.dataset.function, // this a string containing json
    //             });
    //         } else if (selected_in_list) {
    //             let intent = toolboxSearch.value;
    //             history.splice(0, 0, intent);
    //             vscode.postMessage({
    //                 type: "function_activated",
    //                 intent: intent,
    //                 data_function: selected_in_list.dataset.function, // this a string containing json
    //             });
    //         } else {
    //             let intent = toolboxSearch.value;
    //             vscode.postMessage({ type: "open_new_chat", question: intent, chat_empty: false, chat_model: "" });
    //         }
    //         reset_everything_about_commands();
    //         toolboxSearch.value = '';
    //         vscode.postMessage({
    //             type: "focus_back_to_editor",
    //         });
    //         toolbox_update_likes();
    //     }
    //     if (event.key === "Escape") {
    //         event.preventDefault();
    //         let active = document.querySelector(".item-active");
    //         if (active) {
    //             active.classList.remove("item-active");
    //         } else {
    //             vscode.postMessage({
    //                 type: "focus_back_to_editor",
    //             });
    //         }
    //     }
    // });

    const back_buttons = document.querySelectorAll('.refact-welcome__back');
    back_buttons.forEach(button => {
        button.addEventListener('click', function(event) {
            const button_target = event.target.dataset.target;
            let panels = document.querySelectorAll(".refact-welcome__subpanel");
            switch (button_target) {
                default:
                    const screens = document.querySelectorAll(".refact-welcome__subscreen");
                    screens.forEach((screen) => {
                        screen.classList.remove('refact-welcome__subscreen--selected');
                    });
                    document.querySelector('.refact-welcome__menu').style.display = "block";
                    break;
            }
        });
    });

    // back_to_welcome.addEventListener("click", (event) => {
    //     const back_target =
    //     document.querySelector('.refact-welcome__back').style.display = "none";
    //     document.querySelector('.refact-welcome__menu').style.display = "block";
    //     const screens = document.querySelectorAll(".refact-welcome__subscreen");
    //     screens.forEach((screen) => {
    //         screen.classList.remove('refact-welcome__subscreen--selected');
    //     });
    // });

    const chat_new = document.querySelector("#chat-new");
    chat_new.addEventListener("click", () => {
        vscode.postMessage({ type: "open_new_chat", question: '', chat_empty: true, chat_model: "" });
    });

    const statistic = document.querySelector("#statistic");
    statistic.addEventListener("click", () => {
        vscode.postMessage({ type: "open_statistic" });
        vscode.postMessage({ type: "receive_statistic_data" });
    });
    // const chatHistoryButton = document.querySelector("#history");
    // chatHistoryButton.addEventListener("click", () => {
    //     vscode.postMessage({ type: "open_chat_history" });
    // });

    const settingsButton = document.querySelector("#settings");
    settingsButton.addEventListener("click", () => {
        vscode.postMessage({ type: "openSettings" });
    });

    const keysButton = document.querySelector("#keys");
    keysButton.addEventListener("click", () => {
        vscode.postMessage({ type: "openKeys" });
    });

    const reportBugsButton = document.querySelector("#report_bugs");
    reportBugsButton.addEventListener("click", () => {
        vscode.postMessage({ type: "js2ts_report_bug" });
    });

    const profileButton = document.querySelector("#profile");
    profileButton.addEventListener("click", () => {
        vscode.postMessage({ type: "js2ts_goto_profile" });
    });

    const logoutButton = document.querySelector("#logout");
    logoutButton.addEventListener("click", () => {
        document.querySelector('.refact-welcome__apikey_refact').value = '';
        vscode.postMessage({ type: "js2ts_logout" });
    });

    const discordButton = document.querySelector("#discord");
    discordButton.addEventListener("click", () => {
        vscode.postMessage({ type: "js2ts_discord" });
    });

    const privacyButton = document.querySelector("#privacy");
    privacyButton.addEventListener("click", () => {
        vscode.postMessage({ type: "privacy" });
    });

    const fimDebugButton = document.querySelector("#fim-debug");
    fimDebugButton.addEventListener("click", () => {
        vscode.postMessage({ type: "fim_debug" });
    });

    const refreshButton = document.querySelector(".sidebar-plan-button");
    refreshButton.addEventListener("click", () => {
        vscode.postMessage({ type: "js2ts_refresh_login" });
    });

    function check_bookmarked_functions(data) {
        const keys = Object.keys(data);
        keys.forEach((key) => {
            let bookmark = {};
            if (function_bookmarks[key]) {
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

    // function function_tag(function_name) {
    //     let result = false;
    //     longthink_filters.forEach((item) => {
    //         if (function_name.toLowerCase().endsWith(item.toLowerCase())) {
    //             result = item;
    //         }
    //     });
    //     return result;
    // }

    // let current_filter = "";
    // function renderTags(data) {
    //     const filters_bar = document.querySelector('.toolbox-tags');
    //     filters_bar.innerHTML = "";
    //     if (data.length > 0) {
    //         data.forEach((item) => {
    //             const filter = document.createElement("div");
    //             filter.classList.add("toolbox-tag");
    //             filter.dataset.title = item;
    //             filter.innerHTML = item;
    //             filters_bar.appendChild(filter);
    //         });
    //     }
    //     const tags = document.querySelectorAll('.toolbox-tag');
    //     tags.forEach((item) => {
    //         item.addEventListener('click', function (event) {
    //             if (current_filter !== this.dataset.title) {
    //                 tags.forEach((item) => {
    //                     item.classList.remove("toolbox-tag-inactive");
    //                     item.classList.add("toolbox-tag-inactive");
    //                 });
    //                 this.classList.remove('toolbox-tag-inactive');
    //                 const tag = this.dataset.title;
    //                 const filterItems = document.querySelectorAll(".toolbox-item");
    //                 const itemsArray = Array.from(filterItems);
    //                 filterItems.forEach(item => {
    //                     item.style.display = 'none';
    //                 });
    //                 const filteredDivs = itemsArray.filter(div => {
    //                     div.querySelector('.toolbox-function').innerHTML = tag;
    //                     const tags = div.dataset.tags_filter;
    //                     if (tags) {
    //                         const all_tags = JSON.parse(div.dataset.tags_filter);
    //                         if (all_tags.includes(tag)) {
    //                             return div;
    //                         }
    //                     }
    //                 });
    //                 filteredDivs.forEach(div => {
    //                     div.style.display = 'block';
    //                 });
    //                 current_filter = this.dataset.title;
    //             }
    //             else {
    //                 current_filter = "";
    //                 tags.forEach((item) => {
    //                     item.classList.remove("toolbox-tag-inactive");
    //                 });
    //                 const filterItems = document.querySelectorAll(".toolbox-item");
    //                 const itemsArray = Array.from(filterItems);

    //                 const filteredDivs = itemsArray.filter(div => {
    //                     const tags = JSON.parse(div.dataset.tags_filter);
    //                     if (tags) {
    //                         if (tags.length > 1) {
    //                             div.querySelector('.toolbox-function').innerHTML = 'Multiple';
    //                         }
    //                         if (tags.length === 1) {
    //                             div.querySelector('.toolbox-function').innerHTML = tags[0];
    //                         }
    //                         return div;
    //                     }
    //                 });
    //                 filteredDivs.forEach(div => {
    //                     div.style.display = 'block';
    //                 });
    //                 filterItems.forEach(item => item.style.display = 'block');
    //             }
    //         });
    //     });
    // }

    // function on_how_many_lines_selected() {
    //     const toolboxItems = document.querySelectorAll(".toolbox-item");
    //     toolboxItems.forEach((item) => {
    //         let function_dict = JSON.parse(item.dataset.function);
    //         let run = item.querySelector(".toolbox-run");
    //         let content_run = item.querySelector(".toolbox-content-actions .toolbox-run");
    //         let notice = item.querySelector(".toolbox-notice");
    //         let selection_within_limits = (
    //             editor_inform_how_many_lines_selected >= function_dict.selected_lines_min &&
    //             editor_inform_how_many_lines_selected <= function_dict.selected_lines_max);
    //         let good_access_level = true;
    //         let access_level_msg = "";
    //         if (editor_inform_file_access_level === -1) {
    //             good_access_level = false;
    //         }
    //         if (editor_inform_file_access_level === 0) {
    //             good_access_level = false;
    //             access_level_msg = "Privacy: access to this file is restricted.";
    //         }
    //         if (editor_inform_file_access_level === 1 && function_dict.third_party) {
    //             good_access_level = false;
    //             access_level_msg = "Privacy: this function uses a third party API, which is not allowed for this file.";
    //         }
    //         if (!good_access_level) {
    //             run.classList.add('toolbox-run-disabled');
    //             content_run.classList.add('toolbox-run-disabled');
    //             if (access_level_msg) {
    //                 notice.style.display = 'inline-flex';
    //                 notice.innerHTML = access_level_msg;
    //             } else {
    //                 notice.style.display = 'none';
    //             }
    //         } else if (
    //             !function_dict.function_name.includes("free-chat") &&
    //             function_dict.supports_selection === 1 &&
    //             function_dict.supports_highlight === 0 &&
    //             !selection_within_limits
    //         ) {
    //             run.classList.add('toolbox-run-disabled');
    //             content_run.classList.add('toolbox-run-disabled');
    //             notice.style.display = 'inline-flex';
    //             notice.innerHTML = `Please select ${function_dict.selected_lines_min}-${function_dict.selected_lines_max} lines of code.`;
    //         } else {
    //             run.classList.remove('toolbox-run-disabled');
    //             content_run.classList.remove('toolbox-run-disabled');
    //             notice.style.display = 'none';
    //         }
    //     });
    // }

    window.addEventListener("message", (event) => {
        const message = event.data;
        switch (message.command) {
            // case "editor_inform":
            //     editor_inform_how_many_lines_selected = message.selected_lines_count;
            //     editor_inform_file_access_level = message.access_level;
            //     // on_how_many_lines_selected();
            //     break;
            case "focus":
                // toolboxSearch.focus();
                break;
            case "update_longthink_functions":
                longthink_functions_today = message.value;
                // toolbox_update_likes();
                break;
            case "update_bookmarks_list":
                function_bookmarks = message.value;
                break;
            case "ts2js":
                let welcome = document.querySelector('.refact-welcome__whole');
                let info = document.querySelector('.sidebar-logged');
                let plan = document.querySelector('.sidebar-plan');
                let coins = document.querySelector('.sidebar-coins');
                let profile = document.querySelector('#profile');
                let sidebar_account = document.querySelector('.sidebar-account');
                let logout = document.querySelector('#logout');
                let chat = document.querySelector('#chat-new');
                let privacy = document.querySelector('#privacy');
                let statistic = document.querySelector('#statistic');
                let discord = document.querySelector('#discord');
                let settings = document.querySelector('#settings');
                let hotkeys = document.querySelector('#keys');
                welcome.style.display = message.ts2js_havekey ? 'none' : 'block';
                info.style.display = message.ts2js_user ? 'flex' : '';
                plan.style.display = message.ts2js_user ? 'flex' : '';
                document.querySelector('.sidebar-logged span').innerHTML = message.ts2js_user;
                document.querySelector('.sidebar-plan span').innerHTML = message.ts2js_plan;
                sidebar_account.style.display = message.ts2js_user ? 'flex' : 'none'; // common box for name and coins
                profile.style.display = message.ts2js_user ? 'inline-flex' : 'none';
                coins.style.display = message.ts2js_user ? 'flex' : 'none';
                logout.style.display = message.ts2js_havekey ? 'flex' : 'none';
                privacy.style.display = message.ts2js_havekey ? 'flex' : 'none';
                if (message.ts2js_metering_balance) {
                    document.querySelector('.sidebar-coins span').innerHTML = Math.floor(message.ts2js_metering_balance / 100);
                }
                discord.style.display = 'inline-flex';
                chat.style.display = message.ts2js_havekey ? 'flex' : 'none';
                statistic.style.display = message.ts2js_havekey ? 'flex' : 'none';
                fimDebugButton.style.display = message.ts2js_havekey ? "flex": "none";
                settings.style.display = 'flex';
                hotkeys.style.display = message.ts2js_havekey ? 'flex' : 'none';
                if(message.ts2js_apikey) {
                    stop_input_animation();
                    document.querySelector('.refact-welcome__apikey_refact').value = message.ts2js_apikey;
                }
                break;
            default:
                break;
        }
    });
}
