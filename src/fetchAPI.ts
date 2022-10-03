/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetchH2 from 'fetch-h2';
import * as userLogin from "./userLogin";


let globalSeq = 100;


export class PendingRequest {
    seq: number;
    apiPromise: Promise<any> | undefined;
    cancelToken: vscode.CancellationToken;
    cancellationTokenSource: vscode.CancellationTokenSource | undefined;

    constructor(apiPromise: Promise<any> | undefined, cancelToken: vscode.CancellationToken)
    {
        this.seq = globalSeq++;
        this.apiPromise = apiPromise;
        this.cancelToken = cancelToken;
    }

    supplyStream(h2stream: Promise<fetchH2.Response>)
    {
        h2stream.catch((error) => {
            if (!error.message.includes("aborted")) {
                global.menu.statusbarSocketError(true, `STREAM ERROR2: ${error}`);
            } else {
            }
            return;
        });
        this.apiPromise = new Promise((resolve, reject) => {
            h2stream.then((result_stream) => {
                let json = result_stream.json();
                json.then((result) => {
                    global.menu.statusbarSocketError(false);
                    resolve(result);
                }).catch((error) => {
                    // this happens!
                    console.log(["JSON ERROR", this.seq, error]);
                    // global.menu.statusbarSocketError(true, `JSON ERROR: ${error}`);
                    reject(error);
                });
            }).catch((error) => {
                if (!error.message.includes("aborted")) {
                    console.log(["STREAM ERROR", this.seq, error]);
                    global.menu.statusbarSocketError(true, `STREAM ERROR3: ${error}`);
                }
                reject(error);
            });
        }).finally(() => {
            let index = globalRequests.indexOf(this);
            if (index >= 0) {
                globalRequests.splice(index, 1);
            }
            if (globalRequests.length === 0) {
                global.menu.statusbarLoading(false);
            }
            // console.log(["--pendingRequests", globalRequests.length, request.seq]);
        }).catch((error) => {
            if (!error.message.includes("aborted")) {
                global.menu.statusbarSocketError(true, `API ERROR: ${error}`);
            }
        });
        globalRequests.push(this);
        global.menu.statusbarLoading(true);
        // console.log(["++pendingRequests", globalRequests.length, request.seq]);
    }
}


let globalRequests: PendingRequest[] = [];


export async function waitAllRequests()
{
    for (let i=0; i<globalRequests.length; i++) {
        let r = globalRequests[i];
        if (r.apiPromise !== undefined) {
            let tmp = await r.apiPromise;
            console.log([r.seq, "wwwwwwwwwwwwwwwww", tmp]);
        }
    }
}

export function anything_still_working()
{
    for (let i=0; i<globalRequests.length; i++) {
        let r = globalRequests[i];
        if (!r.cancelToken.isCancellationRequested) {
            return true;
        }
    }
    return false;
}

export function cancelAllRequests()
{
    for (let i=0; i<globalRequests.length; i++) {
        let r = globalRequests[i];
        if (r.cancellationTokenSource !== undefined) {
            r.cancellationTokenSource.cancel();
        }
    }
}


export function filename_from_document(document: vscode.TextDocument): string
{
    let file_name = document.fileName;
    let project_dir = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
    if (project_dir !== undefined && file_name.startsWith(project_dir)) {
        // this prevents unnecessary user name and directory details from leaking
        let relative_file_name = file_name.substring(project_dir.length);
        if (relative_file_name.startsWith("/")) {
            relative_file_name = relative_file_name.substring(1);
        }
        return relative_file_name;
    }
    return file_name;
}


export function fetchAPI(
    cancelToken: vscode.CancellationToken,
    sources: { [key: string]: string },
    intent: string,
    functionName: string,
    cursorFile: string,
    cursor0: number,
    cursor1: number,
    maxTokens: number,
    maxEdits: number,
    stop_tokens: string[],
) {
    let tmp = vscode.workspace.getConfiguration().get('codify.infurl');
    let url: string;
    if(typeof tmp === 'undefined' || tmp === null || tmp === '') {
        url = "https://inference.smallcloud.ai/v1/contrast";
    } else {
        url = `${tmp}`;
    }
    let model = vscode.workspace.getConfiguration().get('codify.model');
    if(typeof model === 'undefined' || model === null || model === '') {
        model = 'CONTRASTcode/stable';
    }
    let temp = vscode.workspace.getConfiguration().get('codify.temperature');
    // console.log(["fetchAPI", model]);
    const body = JSON.stringify({
        "model": model,
        "sources": sources,
        "intent": intent,
        "function": functionName,
        "cursor_file": cursorFile,
        "cursor0": cursor0,
        "cursor1": cursor1,
        "temperature": temp,
        "max_tokens": maxTokens,
        "max_edits": maxEdits,
        "stop": stop_tokens,
    });
    const apiKey = userLogin.getApiKey();
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
    };
    let req = new fetchH2.Request(url, {
        method: "POST",
        headers: headers,
        body: body,
        redirect: "follow",
        cache: "no-cache",
        referrer: "no-referrer",
    });
    let init: any = {
    };
    if (cancelToken) {
        let abort = new fetchH2.AbortController();
        cancelToken.onCancellationRequested(() => {
            // console.log(["Fetch cancelled"]);
            abort.abort();
        });
        init.signal = abort.signal;
    }
    let promise = fetchH2.fetch(req, init);
    return promise;
}


export function look_for_common_errors(json: any): boolean
{
    if (json === undefined) {
        // undefined means error is already handled
        return true;
    }
    if (json.detail) {
        global.menu.statusbarSocketError(true, json.detail);
        return true;
    }
    if (json.retcode && json.retcode !== "OK") {
        global.menu.statusbarSocketError(true, json.human_readable_message);
        return true;
    }
    if (json.error) {
        global.menu.statusbarSocketError(true, json.error.message);
        return true;
    }
    return false;
}


export async function report_to_mothership(
    positive: boolean,
    sources: { [key: string]: string },
    results: { [key: string]: string },
    intent: string,
    functionName: string,
    cursor_file: string,
    cursor_pos0: number,
    cursor_pos1: number,
    arrived_ts: number,
) {
    const url = "https://www.smallcloud.ai/v1/report-to-mothership";
    const body = JSON.stringify({
        "positive": positive,
        "sources": sources,
        "results": results,
        "intent": intent,
        "function": functionName,
        "cursor_file": cursor_file,
        "cursor0": cursor_pos0,
        "cursor1": cursor_pos1,
        "ponder_time_ms": Math.round(Date.now() - arrived_ts),
    });
    global.modelFunction = functionName;
    const apiKey = userLogin.getApiKey();
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
    };
    let req = new fetchH2.Request(url, {
        method: "POST",
        headers: headers,
        body: body,
        redirect: "follow",
        cache: "no-cache",
        referrer: "no-referrer",
    });
    let promise = fetchH2.fetch(req);
    promise.then((result) => {
        console.log([positive ? "👍" : "👎", "report_to_mothership", result.status]);
    }).catch((error) => {
        console.log(["report_to_mothership", "error", error]);
    });
    return promise;
}


let complain_once: boolean = true;


export async function login()
{
    const apiKey = userLogin.getApiKey();
    if (global.userLogged && apiKey) {
        return "OK";
    }
    const url = "https://www.smallcloud.ai/v1/api-activate";
    let headers = {
        "Content-Type": "application/json",
        "Authorization": "",
    };
    const ticket = global.userTicket;
    if (ticket && !global.userLogged) {
        headers.Authorization = `codify-${ticket}`;
        // global.userTicket = "";
    } else {
        if (!global.userLogged && apiKey) {
            headers.Authorization = `Bearer ${apiKey}`;
        } else {
            return "";
        }
    }
    let req = new fetchH2.Request(url, {
        method: "GET",
        headers: headers,
        redirect: "follow",
        cache: "no-cache",
        referrer: "no-referrer",
    });
    console.log(["LOGIN", headers.Authorization]);
    try {
        let result = await fetchH2.fetch(req);
        let json: any = await result.json();
        console.log(["login", result.status, json]);
        if (json.retcode === "TICKET-SAVEKEY") {
            await vscode.workspace.getConfiguration().update('codify.apiKey', json.secret_api_key, vscode.ConfigurationTarget.Global);
            await vscode.workspace.getConfiguration().update('codify.personalizeAndImprove', json.fine_tune, vscode.ConfigurationTarget.Global);
            global.userLogged = json.account;
            global.userTicket = "";
            if(global.panelProvider) {
                global.panelProvider.login_success();
            }
            global.menu.choose_color();
        } else if (json.retcode === 'OK') {
            global.userLogged = json.account;
            global.userTicket = "";
            if(global.panelProvider) {
                global.panelProvider.login_success();
            }
            global.menu.choose_color();
        } else if (json.retcode === 'FAILED') {
            global.menu.statusbarSocketError(true, json.human_readable_message);
            if (complain_once) {
                complain_once = false;
                // userLogin.login_message();
            }
            return "";
        } else {
            console.log(["login bug"]);
            return "";
        }
    } catch (error) {
        global.menu.statusbarSocketError(true, error);
        return "";
    }
    return "OK";
}
