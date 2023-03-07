/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetchH2 from 'fetch-h2';
import * as userLogin from "./userLogin";
import * as usageStats from "./usageStats";
import * as usabilityHints from "./usabilityHints";
import * as estate from "./estate";


let globalSeq = 100;


export class PendingRequest {
    seq: number;
    apiPromise: Promise<any> | undefined;
    api_fields: estate.ApiFields | undefined;
    cancelToken: vscode.CancellationToken;
    cancellationTokenSource: vscode.CancellationTokenSource | undefined;
    streaming_callback: Function | undefined;
    streaming_end_callback: Function | undefined;
    streaming_buf: string = "";

    constructor(apiPromise: Promise<any> | undefined, cancelToken: vscode.CancellationToken)
    {
        this.seq = globalSeq++;
        this.apiPromise = apiPromise;
        this.cancelToken = cancelToken;
    }

    set_streaming_callback(callback: Function | undefined, end_callback: Function | undefined)
    {
        this.streaming_callback = callback;
        this.streaming_end_callback = end_callback;
    }

    private async look_for_completed_data_in_streaming_buf()
    {
        let split_slash_n_slash_n = this.streaming_buf.split("\n\n");
        if (split_slash_n_slash_n.length <= 1) {
            return;
        }
        // for (let i = 0; i < split_slash_n_slash_n.length; i++) {
        //     console.log(["split_slash_n_slash_n[" + i + "] = " + split_slash_n_slash_n[i]]);
        // }
        let last = split_slash_n_slash_n[split_slash_n_slash_n.length - 1];
        if (last.length > 0) {
            return; // incomplete, the last one must be empty, means trailing \n\n
        }
        let removed_prefix: string = "";
        let cursor = split_slash_n_slash_n.length - 2;
        while (1) {
            let before_last = split_slash_n_slash_n[cursor];
            if (before_last.substring(0, 6) !== "data: ") {
                console.log("Unexpected data in streaming buf: " + before_last);
                return;
            }
            removed_prefix = before_last.substring(6);
            if (removed_prefix === "[DONE]") { // means nothing (stream will end anyway)
                cursor--;
                continue;
            }
            break;
        }
        console.log(["feed = " + removed_prefix]);
        let json = JSON.parse(removed_prefix);
        if (this.streaming_callback) {
            await this.streaming_callback(json);
        }
        this.streaming_buf = "";
    }

    supply_stream(h2stream: Promise<fetchH2.Response>, api_fields: estate.ApiFields)
    {
        this.api_fields = api_fields;
        h2stream.catch((error) => {
            if (!error.message.includes("aborted")) {
                usageStats.report_success_or_failure(false, "h2stream (1)", api_fields.url, error, "");
            } else {
                // Totally normal, user cancelled the request.
            }
            return;
        });
        this.apiPromise = new Promise((resolve, reject) => {
            h2stream.then(async (result_stream) => {
                if (this.streaming_callback) {
                    // Streaming is a bit homegrown, maybe read the docs:
                    // https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
                    // https://nodejs.org/api/stream.html#stream_readable_readablehighwatermark
                    let readable = await result_stream.readable();
                    readable.on("readable", async () => {
                        // Use readable here because we need to read as much as possible, feed the last
                        // chunk only if model+network is faster than the GUI
                        while (1) {
                            let chunk = readable.read();
                            if (chunk === null) {
                                break;
                            }
                            if (typeof chunk === "string") {
                                this.streaming_buf += chunk;
                                // console.log(["readable data", chunk]);
                            } else {
                                this.streaming_buf += chunk.toString();
                                // console.log(["readable data", chunk.toString()]);
                            }
                            await this.look_for_completed_data_in_streaming_buf();
                        }
                    });
                    readable.on("end", async () => {
                        // console.log(["readable end", this.streaming_buf]);
                        if (this.streaming_end_callback) {
                            await this.streaming_end_callback();
                        }
                    });
                    resolve("");
                } else {
                    // not streaming
                    let json_arrived = await result_stream.json();
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
                }
            }).catch((error) => {
                if (error && !error.message.includes("aborted")) {
                    usageStats.report_success_or_failure(false, api_fields.scope, api_fields.url, error, "");
                }
                reject();
            });
        }).finally(() => {
            let index = _global_reqs.indexOf(this);
            if (index >= 0) {
                _global_reqs.splice(index, 1);
            }
            if (_global_reqs.length === 0) {
                global.status_bar.statusbarLoading(false);
            }
            // console.log(["--pendingRequests", _global_reqs.length, request.seq]);
        }).catch((error) => {
            if (error === undefined) {
                // This is a result of reject() without parameters
                return;
            } else if (!error || !error.message || !error.message.includes("aborted")) {
                usageStats.report_success_or_failure(false, api_fields.scope, api_fields.url, error, "");
            }
        });
        _global_reqs.push(this);
        global.status_bar.statusbarLoading(true);
        // console.log(["++pendingRequests", _global_reqs.length, request.seq]);
    }
}


let _global_reqs: PendingRequest[] = [];


export async function wait_until_all_requests_finished()
{
    for (let i=0; i<_global_reqs.length; i++) {
        let r = _global_reqs[i];
        if (r.apiPromise !== undefined) {
            let tmp = await r.apiPromise;
            console.log([r.seq, "wwwwwwwwwwwwwwwww", tmp]);
        }
    }
}

export function anything_still_working()
{
    for (let i=0; i<_global_reqs.length; i++) {
        let r = _global_reqs[i];
        if (!r.cancelToken.isCancellationRequested) {
            return true;
        }
    }
    return false;
}

export async function cancel_all_requests_and_wait_until_finished()
{
    for (let i=0; i<_global_reqs.length; i++) {
        let r = _global_reqs[i];
        if (r.cancellationTokenSource !== undefined) {
            r.cancellationTokenSource.cancel();
        }
    }
    await wait_until_all_requests_finished();
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
    stream: boolean,
    suggest_longthink_model: string = "",
): [Promise<fetchH2.Response>, estate.ApiFields]
{
    let url = inference_url("/v1/contrast");
    let model_ = vscode.workspace.getConfiguration().get('codify.model') || "CONTRASTcode";
    let model_longthink: string = vscode.workspace.getConfiguration().get('codify.longthinkModel') || suggest_longthink_model;
    if (suggest_longthink_model) {
        model_ = model_longthink;
    }
    vscode.workspace.getConfiguration().update("files.autoSave", "off", true); // otherwise diffs do not work properly
    let model: string = `${model_}`;
    const apiKey = userLogin.secret_api_key();
    if (!apiKey) {
        return [Promise.reject("No API key"), new estate.ApiFields()];
    }
    let temp = 0.2;  // vscode.workspace.getConfiguration().get('codify.temperature');
    let client_version = vscode.extensions.getExtension("smallcloud.codify")!.packageJSON.version;
    let api_fields = new estate.ApiFields();
    api_fields.scope = scope;
    api_fields.url = url;
    api_fields.model = model;
    api_fields.sources = sources;
    api_fields.intent = intent;
    api_fields.function = functionName;
    api_fields.cursor_file = cursorFile;
    api_fields.cursor_pos0 = cursor0;
    api_fields.cursor_pos1 = cursor1;
    api_fields.ts_req = Date.now();
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
        "stream": stream,
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
        referrer: "no-referrer"
    });
    let init: any = {
        timeout: 20*1000,
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


export function fetch_chat_promise(
    cancelToken: vscode.CancellationToken,
    scope: string,
    messages: [string, string][],
    functionName: string,
    maxTokens: number,
    stop_tokens: string[],
): [Promise<fetchH2.Response>, estate.ApiFields]
{
    let url = inference_url("/chat-v1/completions");
    const apiKey = userLogin.secret_api_key();
    if (!apiKey) {
        return [Promise.reject("No API key"), new estate.ApiFields()];
    }
    let client_version = vscode.extensions.getExtension("smallcloud.codify")!.packageJSON.version;
    let api_fields = new estate.ApiFields();
    api_fields.scope = scope;
    api_fields.url = url;
    api_fields.function = functionName;
    api_fields.ts_req = Date.now();
    let json_messages = [];
    for (let i=0; i<messages.length; i++) {
        let role = messages[i][0];
        let text = messages[i][1];
        json_messages.push({
            "role": role,
            "content": text,
        });
    }
    const body = JSON.stringify({
        "messages": json_messages,
        "function": functionName,
        "max_tokens": maxTokens,
        "stop": stop_tokens,
        "temperature": 0.3,
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
        referrer: "no-referrer"
    });
    let init: any = {
        timeout: 20*1000,
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


export function look_for_common_errors(json: any, api_fields: estate.ApiFields | undefined): boolean
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
