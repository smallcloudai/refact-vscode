/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetchH2 from 'fetch-h2';
import * as fetchAPI from "./fetchAPI";
import * as usageStats from "./usageStats";
import * as usabilityHints from "./usabilityHints";
import * as statusBar from "./statusBar";


export async function login_message()
{
    let selection = await vscode.window.showInformationMessage("Click to login to Refact.ai", "Login");
    if(selection === "Login") {
        vscode.commands.executeCommand('refactaicmd.login');
    }
    global.status_bar.choose_color();
}


export async function welcome_message()
{
    let selection = await vscode.window.showInformationMessage("Welcome to Refact.ai!\nPress login to start.", "Login");
    if(selection === "Login") {
        vscode.commands.executeCommand('refactaicmd.login');
    }
    global.status_bar.choose_color();
}


export async function account_message(info: string, action: string, url: string)
{
    let selection = await vscode.window.showInformationMessage(
        info,
        action,
    );
    if (selection === action) {
        vscode.env.openExternal(vscode.Uri.parse(url));
    }
}


export function check_if_login_worked()
{
    let apiKey = secret_api_key();
    if (!global.user_logged_in || !apiKey) { return false; }
    return true;
}


export function secret_api_key(): string
{
    let key = vscode.workspace.getConfiguration().get('refactai.apiKey');
    let manual_infurl = vscode.workspace.getConfiguration().get("refactai.infurl");
    global.custom_infurl = !!manual_infurl;
    if (!key) {
        // Backward compatibility: codify is the old name
        key = vscode.workspace.getConfiguration().get('codify.apiKey');
    }
    if (!key && manual_infurl) {
        key = "self-hosting";
    }
    if (!key) { return ""; }
    if (typeof key !== 'string') { return ""; }
    return key;
}


export async function login()
{
    let apiKey = secret_api_key();
    let manual_infurl = vscode.workspace.getConfiguration().get("refactai.infurl");

    if (global.user_logged_in && secret_api_key()) {
        return "OK";
    }
    let headers = {
        "Content-Type": "application/json",
        "Authorization": "",
    };
    let init: any = {
        method: "GET",
        headers: headers,
        redirect: "follow",
        cache: "no-cache",
        referrer: "no-referrer",
    };
    if (global.streamlined_login_ticket && !global.user_logged_in && !manual_infurl) {
        const recall_url = "https://www.smallcloud.ai/v1/streamlined-login-recall-ticket";
        headers.Authorization = `codify-${global.streamlined_login_ticket}`;
        try {
            let req = new fetchH2.Request(recall_url, init);
            let result = await fetchH2.fetch(req);
            let json: any = await result.json();
            if (json.retcode === "OK") {
                apiKey = json.secret_key;
                global.streamlined_login_ticket = "";
                await vscode.workspace.getConfiguration().update('refactai.apiKey', apiKey, vscode.ConfigurationTarget.Global);
                await usageStats.report_success_or_failure(true, "recall", recall_url, "", "");
                // fall through
            } else if (json.retcode === 'FAILED' && json.human_readable_message.includes("The API key") && global.streamlined_login_countdown !== -1) {
                // expected: do nothing
                global.user_logged_in = "";
                global.user_active_plan = "";
                global.user_metering_balance = 0;
                if (global.side_panel) {
                    global.side_panel.update_webview();
                }
                return "";
            } else {
                await usageStats.report_success_or_failure(false, "recall (1)", recall_url, json, "");
                // fall through, maybe normal login will work
            }
        } catch (error) {
            await usageStats.report_success_or_failure(false, "recall (2)", recall_url, error, "");
            return;
        }
    }
    if (!apiKey && !manual_infurl) {
        // wait until user clicks the login button
        return;
    }
    // ---- TEMPORARY ----
    if (!manual_infurl) {
        manual_infurl = "https://code-scratchpads.smallcloud.ai/";
    }
    // ---- /TEMPORARY ----
    let client_version = vscode.extensions.getExtension("smallcloud.codify")!.packageJSON.version;
    let staging = vscode.workspace.getConfiguration().get('refactai.staging');
    let login_url = `https://www.smallcloud.ai/v1/login?plugin_version=vscode-${client_version}`;
    let third_party = false;
    let ctx = fetchAPI.inference_context(third_party);  // turns off certificate check if custom infurl
    if (typeof manual_infurl === "string" && manual_infurl.length > 0) {
        login_url = fetchAPI.inference_url("/v1/login", third_party);
    } else if (staging !== undefined) {
        login_url = `https://www.smallcloud.ai/v1/login?plugin_version=vscode-${client_version}&want_staging_version=${staging}`;
    }
    headers.Authorization = `Bearer ${apiKey}`;
    try {
        statusBar.set_website_message("");
        let req = new fetchH2.Request(login_url, init);
        let result_promise: Promise<fetchH2.Response>;
        try {
            result_promise = ctx.fetch(req);
        } catch (error) {
            await usageStats.report_success_or_failure(false, "login(1)", login_url, error, "");
            return;
        }
        let result = await result_promise;
        let json: any = await result.json();
        if (json.retcode === "OK") {
            global.user_logged_in = json.account;
            global.user_metering_balance = json.metering_balance || 0;
            global.streamlined_login_ticket = "";
            if (json['longthink-functions-today']){
                global.longthink_functions_today = json['longthink-functions-today-v2'];
            }
            if (json['longthink-filters']){
                global.longthink_filters = json['longthink-filters'];
            }
            if (json.inference_url) {
                fetchAPI.save_url_from_login(json.inference_url);
            }
            if (json.tooltip_message) {
                statusBar.set_website_message(json.tooltip_message);
            }
            if (json.login_message) {
                await usabilityHints.show_message_from_server("LoginServer", json.login_message);
            }
            if (json['chat-v1-style']) {
                global.chat_v1_style = json['chat-v1-style'];
            } else {
                global.chat_v1_style = false;
            }
            if (json.inference) {
                global.user_active_plan = json.inference;
            } else {
                global.user_active_plan = "CUSTOM_SERVER";
            }
            if (global.side_panel) {
                global.side_panel.update_webview();
            }
            if (json.inference === "DISABLED") {
                fetchAPI.save_url_from_login("");
            }
            await usageStats.report_success_or_failure(true, "login", login_url, "", "");
            inference_login_force_retry();
        } else if (json.retcode === 'FAILED' && json.human_readable_message.includes("rate limit")) {
            await usageStats.report_success_or_failure(false, "login-failed", login_url, json.human_readable_message, "");
            return "";
        } else if (json.retcode === 'FAILED') {
            // Login failed, but the request was a success.
            global.user_logged_in = "";
            global.user_active_plan = "";
            global.user_metering_balance = 0;
            if (global.side_panel) {
                global.side_panel.update_webview();
            }
            await usageStats.report_success_or_failure(true, "login-failed", login_url, json.human_readable_message, "");
            return "";
        } else {
            global.user_logged_in = "";
            global.user_active_plan = "";
            global.user_metering_balance = 0;
            if (global.side_panel) {
                global.side_panel.update_webview();
            }
            await usageStats.report_success_or_failure(false, "login (2)", login_url, "unrecognized response", "");
            return "";
        }
    } catch (error) {
        await usageStats.report_success_or_failure(false, "login (3)", login_url, error, "");
        return "";
    }
    // HUGE BUG:
    // fetchH2 thinks it should reuse the session used for login, even though the IP address is not the same!!!
    await fetchAPI.wait_until_all_requests_finished();
    await fetchH2.disconnectAll();
    return "OK";
}


let _last_inference_login_cached_result = false;
let _last_inference_login_key = "";
let _last_inference_login_ts = 0;
let _last_inference_login_infurl = "";
let _inference_login_in_progress = false;


export function inference_login_force_retry()
{
    _last_inference_login_ts = 0;
}


export async function inference_login(): Promise<boolean>
{
    if (_inference_login_in_progress) {
        while (_inference_login_in_progress) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return _last_inference_login_cached_result;
    }
    if (global.last_positive_result + 600*1000 < Date.now()) {  // session (socket) dies by itself after some time
        console.log("inference_login: last_positive_result too old, force disconnect");
        await fetchH2.disconnectAll();
    }
    let manual_infurl = vscode.workspace.getConfiguration().get("refactai.infurl");
    if (manual_infurl) {
        return true;
    }
    let third_party = true;
    let url = fetchAPI.inference_url("/v1/secret-key-activate", third_party);  // not third_party doesn't need activation
    // Activation is really a "kill the cache" operation, such that the user can change plan/settings and see the effect immediately.
    if (global.streamlined_login_countdown >= 0 || url === "") {
        await login();
        url = fetchAPI.inference_url("/v1/secret-key-activate", third_party);
    }
    // Without login it will still work, with inference URL in settings. (this happens if the website is down)
    let apiKey = secret_api_key();
    let _conf_url = vscode.workspace.getConfiguration().get('refactai.infurl');
    if (!_conf_url) {
        // Backward compatibility: codify is the old name
        _conf_url = vscode.workspace.getConfiguration().get('codify.infurl');
    }
    let conf_url = "";
    if (typeof _conf_url === 'string') {
        conf_url = _conf_url;
    } else {
        conf_url = "";
    }
    if (
        _last_inference_login_ts + 300*1000 > Date.now() &&
        _last_inference_login_key === apiKey && apiKey !== "" &&
        _last_inference_login_infurl === conf_url
    ) {
        return _last_inference_login_cached_result;
    }
    await fetchH2.disconnectAll();
    await fetchAPI.non_verifying_ctx.disconnectAll();
    console.log(["perform inference login", url]);
    if (!url) {
        return false;
    }
    if (!apiKey) {
        _last_inference_login_key = "";
        _last_inference_login_ts = 0;
        _last_inference_login_cached_result = false;
        _last_inference_login_infurl = conf_url;
        return _last_inference_login_cached_result;
    }
    let report_this_url = "private_url";
    if (url.indexOf("smallcloud") > 0) {
        report_this_url = url;
    } // else might be a private url
    let headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
    };
    let init: any = {
        method: "GET",
        headers: headers,
        redirect: "follow",
        cache: "no-cache",
        referrer: "no-referrer",
    };
    try {
        _inference_login_in_progress = true;
        let req = new fetchH2.Request(url, init);
        let result_promise: Promise<fetchH2.Response>;
        try {
            result_promise = fetchH2.fetch(req);
        } catch (error) {
            _last_inference_login_cached_result = false;
            _last_inference_login_key = apiKey;
            _last_inference_login_ts = Date.now();
            _last_inference_login_infurl = conf_url;
            await usageStats.report_success_or_failure(false, "inference_login(1)", report_this_url, error, "");
            return false;
        }
        let result = await result_promise;
        let json: any = await result.json();
        if (result.status === 401) {
            _last_inference_login_cached_result = false;
            _last_inference_login_key = apiKey;
            _last_inference_login_ts = Date.now();
            _last_inference_login_infurl = conf_url;
            await usageStats.report_success_or_failure(false, "inference_login(2)", report_this_url, json.detail, "");
        } else if (json.retcode === "OK") {
            // Success here
            if (json.inference_message) {
                await usabilityHints.show_message_from_server("InferenceServer", json.inference_message);
            }
            if (json.tooltip_message) {
                statusBar.set_inference_message(json.tooltip_message);
            }
            _last_inference_login_cached_result = true;
            _last_inference_login_key = apiKey;
            _last_inference_login_ts = Date.now();
            _last_inference_login_infurl = conf_url;
            await usageStats.report_success_or_failure(true, "inference_login", report_this_url, "", "");
        } else if (json.detail) {
            _last_inference_login_cached_result = false;
            _last_inference_login_key = apiKey;
            _last_inference_login_ts = 0;
            _last_inference_login_infurl = conf_url;
            await usageStats.report_success_or_failure(false, "inference_login(2)", report_this_url, json.detail, "");
        } else {
            _last_inference_login_cached_result = false;
            _last_inference_login_key = apiKey;
            _last_inference_login_ts = 0;
            _last_inference_login_infurl = conf_url;
            await usageStats.report_success_or_failure(false, "inference_login(3)", report_this_url, json, "");
        }
    } catch (error) {
        _last_inference_login_cached_result = false;
        _last_inference_login_key = apiKey;
        _last_inference_login_ts = 0;
        _last_inference_login_infurl = conf_url;
        await usageStats.report_success_or_failure(false, "inference_login(4)", report_this_url, error, "");
    } finally {
        _inference_login_in_progress = false;
    }
    return _last_inference_login_cached_result;
}
