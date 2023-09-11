/* eslint-disable @typescript-eslint/naming-convention */
(function () {
    const vscode = acquireVsCodeApi();
    // let presets = document.querySelectorAll(".presets li");
    const body = document.querySelector("body");
    const sidebar = document.querySelector("#sidebar");
    const toolbox = document.querySelector(".toolbox");
    const toolboxSearch = document.querySelector("#toolbox-search");
    const toolboxList = document.querySelector(".toolbox-list");
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

    const next_provider_button = document.querySelector('.refact-welcome__nextprov');
    next_provider_button.addEventListener("click", () => {
        const selection_type = document.querySelector('.refact-welcome__proradio:checked').value;
        change_provider_subscreen(selection_type);
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
        const enter_apikey = document.querySelector('.refact-welcome__apikey');
        vscode.postMessage({
            type: "save_enterprise",
            endpoint: enter_endpoint.value,
            apikey: enter_apikey.value,
        });
    });

    const button_hf = document.querySelector('.refact-welcome__hf');
    button_hf.addEventListener("click", () => {
        vscode.postMessage({
            type: "button_hf",
        });
    });

    const button_refact = document.querySelector('.refact-welcome');
    button_refact.addEventListener("click", () => {
        vscode.postMessage({
            type: "button_refact",
        });
    });

    const back_buttons = document.querySelectorAll('.refact-welcome__back');
    back_buttons.forEach(button => {
        button.addEventListener('click', function(event) {
            const button_target = event.target.dataset.target;
            let panels = document.querySelectorAll(".refact-welcome__subpanel");
            switch (button_target) {
                case "huggingface":
                case "refact":
                    panels.forEach((panel) => {
                        panel.classList.remove('refact-welcome__subpanel--selected');
                    });
                    document.querySelector('.refact-welcome__personal').classList.toggle('refact-welcome__subscreen--selected');
                    break;
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

    const chatButton = document.querySelector("#chat");
    chatButton.addEventListener("click", () => {
        vscode.postMessage({ type: "open_new_chat", question: '', chat_empty: true, chat_model: "" });
    });

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
        vscode.postMessage({ type: "js2ts_logout" });
    });

    const discordButton = document.querySelector("#discord");
    discordButton.addEventListener("click", () => {
        vscode.postMessage({ type: "js2ts_discord" });
    });


    const loginButton = document.querySelector("#login");
    loginButton.addEventListener("click", () => {
        vscode.postMessage({ type: "login" });
    });

    const privacyButton = document.querySelector("#privacy");
    privacyButton.addEventListener("click", () => {
        vscode.postMessage({ type: "privacy" });
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

    function function_tag(function_name) {
        let result = false;
        longthink_filters.forEach((item) => {
            if(function_name.toLowerCase().endsWith(item.toLowerCase())) {
                result = item;
            }
        });
        return result;
    }

    let current_filter = "";
    function renderTags(data) {
        const filters_bar = document.querySelector('.toolbox-tags');
        filters_bar.innerHTML = "";
        if(data.length > 0) {
            data.forEach((item) => {
                const filter = document.createElement("div");
                filter.classList.add("toolbox-tag");
                filter.dataset.title = item;
                filter.innerHTML = item;
                filters_bar.appendChild(filter);
            });
        }
        const tags = document.querySelectorAll('.toolbox-tag');
        tags.forEach((item) => {
            item.addEventListener('click', function (event) {
                if(current_filter !== this.dataset.title) {
                    tags.forEach((item) => {
                        item.classList.remove("toolbox-tag-inactive");
                        item.classList.add("toolbox-tag-inactive");
                    });
                    this.classList.remove('toolbox-tag-inactive');
                    const tag = this.dataset.title;
                    const filterItems = document.querySelectorAll(".toolbox-item");
                    const itemsArray = Array.from(filterItems);
                    filterItems.forEach(item => {
                        item.style.display = 'none';
                    });
                    const filteredDivs = itemsArray.filter(div => {
                        div.querySelector('.toolbox-function').innerHTML = tag;
                        const tags = div.dataset.tags_filter;
                        if(tags) {
                            const all_tags = JSON.parse(div.dataset.tags_filter);
                            if(all_tags.includes(tag)) {
                                return div;
                            }
                        }
                    });
                    filteredDivs.forEach(div => {
                        div.style.display = 'block';
                    });
                    current_filter = this.dataset.title;
                }
                else {
                    current_filter = "";
                    tags.forEach((item) => {
                        item.classList.remove("toolbox-tag-inactive");
                    });
                    const filterItems = document.querySelectorAll(".toolbox-item");
                    const itemsArray = Array.from(filterItems);

                    const filteredDivs = itemsArray.filter(div => {
                        const tags = JSON.parse(div.dataset.tags_filter);
                        if(tags) {
                            if (tags.length > 1) {
                                div.querySelector('.toolbox-function').innerHTML = 'Multiple';
                            }
                            if (tags.length === 1) {
                                div.querySelector('.toolbox-function').innerHTML = tags[0];
                            }
                            return div;
                        }
                    });
                    filteredDivs.forEach(div => {
                        div.style.display = 'block';
                    });
                    filterItems.forEach(item => item.style.display = 'block');
                }
            });
        });
    }

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
                // toolbox_update_likes(); -- updates anyway, not needed
                break;
            case "update_bookmarks_list":
                function_bookmarks = message.value;
                break;
            case "ts2web":
                let info = document.querySelector('.sidebar-logged');
                let plan = document.querySelector('.sidebar-plan');
                let coins = document.querySelector('.sidebar-coins');
                let login = document.querySelector('#login');
                let profile = document.querySelector('#profile');
                let logout = document.querySelector('#logout');
                let chat = document.querySelector('#chat');
                let bug = document.querySelector('#report_bugs');
                let privacy = document.querySelector('#privacy');
                let discord = document.querySelector('#discord');
                let settings = document.querySelector('#settings');
                let keys = document.querySelector('#keys');

                discord.style.display = 'inline-flex';
                bug.style.display = 'inline-flex';
                info.style.display = message.ts2web_user ? 'flex' : '';
                plan.style.display = message.ts2web_plan ? 'flex' : '';
                document.querySelector('.sidebar-logged span').innerHTML = message.ts2web_user;
                document.querySelector('.sidebar-plan span').innerHTML = message.ts2web_plan;
                login.style.display = message.ts2web_user ? 'none' : 'block';
                profile.style.display = message.ts2web_user ? 'inline-flex' : 'none';
                logout.style.display = message.ts2web_user ? 'inline-flex' : 'none';
                chat.style.display = message.ts2web_user ? 'flex' : 'none';
                // data.style.display = message.ts2web_user ? 'block' : 'none';
                coins.style.display = message.ts2web_user ? 'flex' : 'none';
                privacy.style.display = (message.ts2web_user || message.ts2web_custom_infurl) ? 'inline-flex' : 'none';
                // TODO: always show settings, a place to put custom infurl
                // settings.style.display = message.ts2web_user ? 'inline-flex' : 'none';
                keys.style.display = message.ts2web_user ? 'inline-flex' : 'none';
                if(message.ts2web_user === 'self-hosted') {
                    document.querySelector('.sidebar-account').style.display = 'none';
                    profile.style.display = 'none';
                }

                if (message.ts2web_metering_balance) {
                    document.querySelector('.sidebar-coins span').innerHTML = Math.floor(message.ts2web_metering_balance / 100);
                }
                if(message.ts2web_staging) {
                    staging = message.ts2web_staging;
                }
                if(message.ts2web_custom_infurl && message.ts2web_custom_infurl !== '') {
                    login.style.display = 'none';
                    // settings.classList.toggle('settings-full');
                }
                break;
            default:
                break;
        }
    });
})();
