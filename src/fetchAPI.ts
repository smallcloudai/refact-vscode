/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetchH2 from 'fetch-h2';
import * as userLogin from "./userLogin";
import * as usageStats from "./usageStats";
import * as usabilityHints from "./usabilityHints";


let globalSeq = 100;


export class ApiFields {
    scope: string = "";
    url: string = "";
    model: string = "";
    sources: { [key: string]: string } = {};
    results: { [key: string]: string } = {};
    intent: string = "";
    function: string = "";
    cursor_file: string = "";
    cursor0: number = 0;
    cursor1: number = 0;
}


export class PendingRequest {
    seq: number;
    apiPromise: Promise<any> | undefined;
    api_fields: ApiFields | undefined;
    cancelToken: vscode.CancellationToken;
    cancellationTokenSource: vscode.CancellationTokenSource | undefined;

    constructor(apiPromise: Promise<any> | undefined, cancelToken: vscode.CancellationToken)
    {
        this.seq = globalSeq++;
        this.apiPromise = apiPromise;
        this.cancelToken = cancelToken;
    }

    supply_stream(h2stream: Promise<fetchH2.Response>, api_fields: ApiFields)
    {
        this.api_fields = api_fields;
        h2stream.catch((error) => {
            if (!error.message.includes("aborted")) {
                usageStats.report_success_or_failure(false, "h2stream (1)", api_fields.url, `${error}`, "");
            } else {
                // Totally normal, user cancelled the request.
            }
            return;
        });
        this.apiPromise = new Promise((resolve, reject) => {
            h2stream.then((result_stream) => {
                let json = result_stream.json();
                json.then((json_arrived) => {
                    if (json_arrived.inference_message) {
                        // It's async, potentially two messages might appear if requests are fast, but we don't launch new requests
                        // until the previous one is finished, should be fine...
                        usabilityHints.show_message_from_server("InferenceServer", json_arrived.inference_message);
                    }
                    if (look_for_common_errors(json_arrived, api_fields)) {
                        reject();
                        return;
                    }
                    usageStats.report_success_or_failure(true, api_fields.scope, api_fields.url, "", json_arrived["model"]);
                    resolve(json_arrived);
                }).catch((error) => {
                    usageStats.report_success_or_failure(false, "h2stream (2)", api_fields.url, `${error}`, "");
                    reject(error);
                });
            }).catch((error) => {
                if (!error.message.includes("aborted")) {
                    usageStats.report_success_or_failure(false, "h2stream (3)", api_fields.url, `${error}`, "");
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
                usageStats.report_success_or_failure(false, "h2stream (4)", api_fields.url, `${error}`, "");
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
    if (usageStats.get_global_last_useful_result_ts() < Date.now() - 60 * 1000) {
        console.log(["disconnect http session, last useful result too old"]);
        // this helps with broken sessions
        await fetchH2.disconnectAll();
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

export async function cancelAllRequests()
{
    for (let i=0; i<globalRequests.length; i++) {
        let r = globalRequests[i];
        if (r.cancellationTokenSource !== undefined) {
            r.cancellationTokenSource.cancel();
        }
    }
    await waitAllRequests();
}


export let global_inference_url_from_login = "";


export function save_url_from_login(url: string)
{
    global_inference_url_from_login = url;
}


export function inference_url(addthis: string)
{
    let url_ = vscode.workspace.getConfiguration().get('codify.infurl');
    let url: string;
    if (typeof url_ !== 'string' || url_ === '' || !url_) {
        url = global_inference_url_from_login;
    } else {
        url = `${url_}`;
    }
    if (!url) {
        return url;
    }
    while (url.endsWith("/")) {
        url = url.slice(0, -1);
    }
    url += addthis;
    return url;
}


export function fetch_api_promise(
    cancelToken: vscode.CancellationToken,
    scope: string,
    sources: { [key: string]: string },
    intent: string,
    functionName: string,
    cursorFile: string,
    cursor0: number,
    cursor1: number,
    maxTokens: number,
    maxEdits: number,
    stop_tokens: string[],
): [Promise<fetchH2.Response>, ApiFields]
{
    let url = inference_url("/v1/contrast");
    let model_ = vscode.workspace.getConfiguration().get('codify.model');
    let model: string;
    if (typeof model_ !== 'string' || model_ === '') {
        model = 'CONTRASTcode';
    } else {
        model = `${model_}`;
    }
    const apiKey = userLogin.getApiKey();
    if (!apiKey) {
        return [Promise.reject("No API key"), new ApiFields()];
    }
    let temp = 0.2;  // vscode.workspace.getConfiguration().get('codify.temperature');
    let client_version = vscode.extensions.getExtension("smallcloud.codify")!.packageJSON.version;
    let api_fields = new ApiFields();
    api_fields.scope = scope;
    api_fields.url = url;
    api_fields.model = model;
    api_fields.sources = sources;
    api_fields.intent = intent;
    api_fields.function = functionName;
    api_fields.cursor_file = cursorFile;
    api_fields.cursor0 = cursor0;
    api_fields.cursor1 = cursor1;
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
        "client": `vscode-${client_version}`,
    });
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
            console.log(["API fetch cancelled"]);
            abort.abort();
        });
        init.signal = abort.signal;
    }
    let promise = fetchH2.fetch(req, init);
    return [promise, api_fields];
}


export function look_for_common_errors(json: any, api_fields: ApiFields | undefined): boolean
{
    if (json === undefined) {
        // undefined means error is already handled, do nothing
        return true;
    }
    let scope = "unknown";
    let url = "unknown";
    if (api_fields !== undefined) {
        scope = api_fields.scope;
        url = api_fields.url;
    }
    if (json.detail) {
        usageStats.report_success_or_failure(false, scope, url, json.detail, "");
        return true;
    }
    if (json.retcode && json.retcode !== "OK") {
        usageStats.report_success_or_failure(false, scope, url, json.human_readable_message, "");
        return true;
    }
    if (json.error) {
        usageStats.report_success_or_failure(false, scope, url, json.error.message, "");
        return true;
    }
    return false;
}
