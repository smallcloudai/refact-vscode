/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetchH2 from 'fetch-h2';
import * as userLogin from "./userLogin";


let _global_last_useful_result_ts = 0;


export function get_global_last_useful_result_ts() {
    return _global_last_useful_result_ts;
}


export async function report_success_or_failure(
    positive: boolean,
    scope: string,
    related_url: string,
    error_message: string | any,
    model_name: string | undefined,
) {
    let invalid_session = false;
    let timedout = false;
    let conn_refused = false;
    if (typeof error_message !== "string") {
        if (error_message.code && error_message.code.includes("INVALID_SESSION")) {
            invalid_session = true;
        }
        if (error_message.code && error_message.code.includes("ETIMEDOUT")) {
            timedout = true;
        }
        if (error_message.code && error_message.code.includes("ECONNREFUSED")) {
            conn_refused = true;
        }
        if (error_message instanceof Error && error_message.message) {
            error_message = error_message.message;
        } else {
            error_message = JSON.stringify(error_message);
        }
    } else {
        if (error_message.includes("INVALID_SESSION")) {
            invalid_session = true;
        }
        if (error_message.includes("ETIMEDOUT") || error_message.includes("timed out")) {
            timedout = true;
        }
        if (error_message.includes("ECONNREFUSED")) {
            conn_refused = true;
        }
    }
    if (invalid_session || conn_refused) {
        await fetchH2.disconnectAll();
        userLogin.inference_login_force_retry();
        console.log(["INVALID_SESSION, ECONNREFUSED => inference_login_force_retry"]);
    }
    if (timedout) {
        await fetchH2.disconnectAll();
        console.log(["ETIMEDOUT => disconnectAll"]);
    }
    if (error_message.length > 200) {
        error_message = error_message.substring(0, 200) + "…";
    }
    if (model_name) {
        global.status_bar.url_and_model_worked(related_url, model_name);
    }
    global.status_bar.set_socket_error(!positive, error_message);
    if (positive) {
        _global_last_useful_result_ts = Date.now();
    }
    if (userLogin.check_if_login_worked()) {
        if (global.side_panel) {
            global.side_panel.update_webview();
        }
    } else {
        if (global.side_panel) {
            global.side_panel.update_webview();
        }
        global.status_bar.url_and_model_worked("", "");
    }
    let error_message_json = JSON.stringify(error_message);
    let msg = `${positive ? "1" : "0"}\t${scope}\t${related_url}\t${error_message_json}`;  // tabs for field separation, still human readable
    // Typical msg:
    // 1  "completion"  https://inference.smallcloud.ai/v1/contrast  ""
    // 0  "completion"  https://inference.smallcloud.ai/v1/contrast  "Could not verify your API key (3)"
    console.log([msg]);
    let global_context: vscode.ExtensionContext|undefined = global.global_context;
    if (global_context !== undefined) {
        let count_msg: { [key: string]: number } | undefined = await global_context.globalState.get("usage_stats");
        if (typeof count_msg !== "object") {
            count_msg = {};
        }
        if (count_msg[msg] === undefined) {
            count_msg[msg] = 1;
        } else {
            count_msg[msg] += 1;
        }
        await global_context.globalState.update(
            "usage_stats",
            count_msg
        );
    }
}


export async function report_usage_stats()
{
    let global_context: vscode.ExtensionContext|undefined = global.global_context;
    if (global_context === undefined) {
        return;
    }
    let count_msg: { [key: string]: number } | undefined = await global_context.globalState.get("usage_stats");
    if (count_msg === undefined) {
        return;
    }
    let usage = "";
    for (let key in count_msg) {
        usage += `${key} ${count_msg[key]}\n`;
    }
    const apiKey = userLogin.secret_api_key();
    if (!apiKey) {
        return;
    }
    let client_version = vscode.extensions.getExtension("smallcloud.codify")!.packageJSON.version;
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
    };
    let url = "https://www.smallcloud.ai/v1/usage-stats";
    let response = await fetchH2.fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
            "client_version": `vscode-${client_version}`,
            "usage": usage,
        }),
    });
    if (response.status !== 200) {
        console.log([response.status, url]);
        return;
    }
    await global_context.globalState.update("usage_stats", {});
}
