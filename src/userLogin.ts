/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetchH2 from 'fetch-h2';
import * as fetchAPI from "./fetchAPI";
import * as usageStats from "./usageStats";
import * as usabilityHints from "./usabilityHints";
import * as statusBar from "./statusBar";


export async function login_message()
{
    let selection = await vscode.window.showInformationMessage("Click to login to Codify", "Login");
    if(selection === "Login") {
        vscode.commands.executeCommand('plugin-vscode.login');
    }
    global.status_bar.choose_color();
}


export async function welcome_message()
{
    let selection = await vscode.window.showInformationMessage("Welcome to Codify!\nPress login to start.", "Login");
    if(selection === "Login") {
        vscode.commands.executeCommand('plugin-vscode.login');
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
    const key = vscode.workspace.getConfiguration().get('codify.apiKey');
    if (!key) { return ""; }
    if (typeof key !== 'string') { return ""; }
    return key;
}


export async function login()
{
    let apiKey = secret_api_key();
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
    if (global.streamlined_login_ticket && !global.user_logged_in) {
        const recall_url = "https://www.smallcloud.ai/v1/streamlined-login-recall-ticket";
        headers.Authorization = `codify-${global.streamlined_login_ticket}`;
        try {
            let req = new fetchH2.Request(recall_url, init);
            let result = await fetchH2.fetch(req);
            let json: any = await result.json();
            if (json.retcode === "OK") {
                apiKey = json.secret_key;
                global.streamlined_login_ticket = "";
                await vscode.workspace.getConfiguration().update('codify.apiKey', apiKey, vscode.ConfigurationTarget.Global);
                await usageStats.report_success_or_failure(true, "recall", recall_url, "", "");
                // fall through
            } else if (json.retcode === 'FAILED' && json.human_readable_message.includes("The API key") && global.streamlined_login_countdown !== -1) {
                // expected: do nothing
                global.user_logged_in = "";
                global.user_active_plan = "";
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
    if (!apiKey) {
        // wait until user clicks the login button
        return;
    }
    const login_url = "https://www.smallcloud.ai/v1/login";
    headers.Authorization = `Bearer ${apiKey}`;
    try {
        statusBar.set_website_message("");
        let req = new fetchH2.Request(login_url, init);
        let result = await fetchH2.fetch(req);
        let json: any = await result.json();
        if (json.retcode === "OK") {
            global.user_logged_in = json.account;
            global.streamlined_login_ticket = "";
            if (json.inference_url) {
                fetchAPI.save_url_from_login(json.inference_url);
            }
            if (json.tooltip_message) {
                statusBar.set_website_message(json.tooltip_message);
            }
            if (json.login_message) {
                await usabilityHints.show_message_from_server("LoginServer", json.login_message);
            }
            global.user_active_plan = json.inference;
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
            if (global.side_panel) {
                global.side_panel.update_webview();
            }
            await usageStats.report_success_or_failure(true, "login-failed", login_url, json.human_readable_message, "");
            return "";
        } else {
            global.user_logged_in = "";
            global.user_active_plan = "";
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
    return "OK";
}


let _last_inference_login_cached_result = false;
let _last_inference_login_key = "";
let _last_inference_login_ts = 0;


export function inference_login_force_retry()
{
    _last_inference_login_ts = 0;
}


export async function inference_login(): Promise<boolean>
{
    if (global.streamlined_login_countdown >= 0) {
        await login();
    }
    // Without login it will still work, with inference URL in settings.
    let apiKey = secret_api_key();
    if (_last_inference_login_ts + 300*1000 > Date.now() && _last_inference_login_key === apiKey && apiKey !== "") {
        return _last_inference_login_cached_result;
    }
    let url = fetchAPI.inference_url("/v1/secret-key-activate");
    if (!url) {
        return false;
    }
    if (!apiKey) {
        _last_inference_login_key = "";
        _last_inference_login_ts = 0;
        _last_inference_login_cached_result = false;
        return _last_inference_login_cached_result;
    }
    let report_this_url = "private_url";
    if (url.indexOf("smallcloud") > 0) {
        report_this_url = url;
    } // else might be private
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
        let req = new fetchH2.Request(url, init);
        let result = await fetchH2.fetch(req);
        let json: any = await result.json();
        if (json.retcode === "OK") {
            await usageStats.report_success_or_failure(true, "inference_login", report_this_url, "", "");
            if (json.inference_message) {
                await usabilityHints.show_message_from_server("InferenceServer", json.inference_message);
            }
            if (json.tooltip_message) {
                statusBar.set_inference_message(json.tooltip_message);
            }
            _last_inference_login_cached_result = true;
            _last_inference_login_key = apiKey;
            _last_inference_login_ts = Date.now();
        } else if (json.detail) {
            _last_inference_login_cached_result = false;
            _last_inference_login_key = apiKey;
            _last_inference_login_ts = Date.now();
            await usageStats.report_success_or_failure(false, "inference_login", report_this_url, json.detail, "");
        } else {
            _last_inference_login_cached_result = false;
            _last_inference_login_key = apiKey;
            _last_inference_login_ts = Date.now();
            await usageStats.report_success_or_failure(false, "inference_login", report_this_url, json, "");
        }
    } catch (error) {
        _last_inference_login_cached_result = false;
        _last_inference_login_key = apiKey;
        _last_inference_login_ts = Date.now();
        await usageStats.report_success_or_failure(false, "inference_login", report_this_url, error, "");
    }
    return _last_inference_login_cached_result;
}
