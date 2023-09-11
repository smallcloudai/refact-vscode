/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetchH2 from 'fetch-h2';
import * as fetchAPI from "./fetchAPI";
import * as usageStats from "./usageStats";
import * as usabilityHints from "./usabilityHints";
import * as statusBar from "./statusBar";


export async function login_message()
{
    await vscode.commands.executeCommand('workbench.view.extension.refact-toolbox-pane');
}


export async function welcome_message()
{
    let selection = await vscode.window.showInformationMessage("Welcome to Refact.ai!\nPress login to start.", "Login");
    if(selection === "Login") {
        await vscode.commands.executeCommand('workbench.view.extension.refact-toolbox-pane');
    }
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


export function secret_api_key(): string
{
    let key = vscode.workspace.getConfiguration().get('refactai.apiKey');
    if (!key) {
        // Backward compatibility: codify is the old name
        key = vscode.workspace.getConfiguration().get('codify.apiKey');
    }
    if (!key) { return ""; }
    if (typeof key !== 'string') { return ""; }
    return key;
}


export async function streamlined_login()
{
    let apiKey = secret_api_key();
    if (apiKey) {
        return "OK";
    }
    if (!global.streamlined_login_ticket) {
        return "";
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
    if (global.streamlined_login_ticket) {
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
            return "";
        }
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
    let url = fetchAPI.inference_url("/v1/secret-key-activate", third_party);
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
