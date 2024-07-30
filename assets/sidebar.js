/* eslint-disable @typescript-eslint/naming-convention */
function sidebar_general_script(vscode) {
    const telemetry_optin = document.querySelector('#telemetrycode');
    telemetry_optin && telemetry_optin.addEventListener('change',()=> {
        vscode.postMessage({
            type: "save_telemetry_settings",
            code: document.querySelector('.refact-welcome__telemetrycode').checked
        });
    });

    const chat_new = document.querySelector("#chat-new");
    chat_new.addEventListener("click", () => {
        vscode.postMessage({ type: "open_new_chat", question: '', chat_empty: true, chat_model: "" });
    });

    const statistic = document.querySelector("#statistic");
    statistic.addEventListener("click", () => {
        vscode.postMessage({ type: "open_statistic" });
        vscode.postMessage({ type: "receive_statistic_data" });
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
                privacy.style.display = 'none';
                // privacy.style.display = message.ts2js_havekey ? 'flex' : 'none';
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
