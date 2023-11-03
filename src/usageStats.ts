/* eslint-disable @typescript-eslint/naming-convention */
import * as fetchH2 from 'fetch-h2';
import * as userLogin from "./userLogin";


export async function send_network_problems_to_status_bar(
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
    }
    if (typeof error_message === "string") {
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
    if (!positive) {
        await fetchH2.disconnectAll();
    } else {
        global.last_positive_result = Date.now();
    }
    if (invalid_session || conn_refused) {
        userLogin.inference_login_force_retry();
        console.log(["INVALID_SESSION, ECONNREFUSED => inference_login_force_retry"]);
    }
    if (timedout) {
        userLogin.inference_login_force_retry();
        // console.log(["ETIMEDOUT => disconnectAll"]);
    }
    if (error_message.length > 200) {
        error_message = error_message.substring(0, 200) + "…";
    }
    // if (model_name) {
    //     global.status_bar.url_and_model_worked(related_url, model_name);
    // }
    global.status_bar.set_socket_error(!positive, error_message);
    if (global.side_panel) {
        global.side_panel.update_webview();
    }
    // global.status_bar.url_and_model_worked("", "");
    let error_message_json = JSON.stringify(error_message);
    let msg = `${positive ? "1" : "0"}\t${scope}\t${related_url}\t${error_message_json}`;  // tabs for field separation, still human readable
    console.log([msg]);
}


