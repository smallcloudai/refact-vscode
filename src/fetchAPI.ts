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
    streaming_error: boolean = false;

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
        let to_eat = "";
        while (1) {
            let split_slash_n_slash_n = this.streaming_buf.split("\n\n");
            if (split_slash_n_slash_n.length <= 1) {
                return;
            }
            let first = split_slash_n_slash_n[0];
            this.streaming_buf = split_slash_n_slash_n.slice(1).join("\n\n");
            if (first.substring(0, 6) !== "data: ") {
                console.log("Unexpected data in streaming buf: " + first);
                continue;
            }
            to_eat = first.substring(6);
            if (to_eat === "[DONE]") {
                if (this.streaming_end_callback) {
                    // The normal way to end the streaming
                    await this.streaming_end_callback(this.streaming_error);
                    this.streaming_end_callback = undefined;
                }
                break;
            }
            if (to_eat === "[ERROR]") {
                console.log("Streaming error");
                this.streaming_error = true;
                break;
            }
            let json = JSON.parse(to_eat);
            if (this.streaming_callback) {
                await this.streaming_callback(json);
            }
        }
    }

    supply_stream(h2stream: Promise<fetchH2.Response>, api_fields: estate.ApiFields)
    {
        this.streaming_error = false;
        this.api_fields = api_fields;
        h2stream.catch((error) => {
            let aborted = error && error.message && error.message.includes("aborted");
            if (!aborted) {
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
                    readable.on("close", async () => {
                        // console.log(["readable end", this.streaming_buf]);
                        if (this.streaming_buf.startsWith("{")) {
                            // likely a error, because it's not a stream, no "data: " prefix
                            console.log(["looks like a error", this.streaming_buf]);
                            this.streaming_error = true;
                            usageStats.report_success_or_failure(false, api_fields.scope, api_fields.url, this.streaming_buf, "");
                        } else if (this.streaming_error) {
                            usageStats.report_success_or_failure(false, api_fields.scope, api_fields.url, "streaming_error", "");
                        } else {
                            usageStats.report_success_or_failure(true, api_fields.scope, api_fields.url, "", "");
                        }
                        // Normally [DONE] produces a callback, but it's possible there's no [DONE] sent by the server.
                        // Wait 500ms because inside VS Code "readable" and "end"/"close" are sometimes called in the wrong order.
                        await new Promise(resolve => setTimeout(resolve, 500));
                        if (this.streaming_end_callback) {
                            await this.streaming_end_callback(this.streaming_error);
                            this.streaming_end_callback = undefined;
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
                    let model_name = json_arrived["model"];
                    if (typeof json_arrived === "object" && json_arrived.length !== undefined) {
                        model_name = json_arrived[0]["model"];
                    }
                    usageStats.report_success_or_failure(true, api_fields.scope, api_fields.url, "", model_name);
                    resolve(json_arrived);
                }
            }).catch(async (error) => {
                let aborted = error && error.message && error.message.includes("aborted");
                if (!aborted) {
                    usageStats.report_success_or_failure(false, api_fields.scope, api_fields.url, error, "");
                }
                if (this.streaming_end_callback) {
                    await this.streaming_end_callback(error !== undefined);
                    this.streaming_end_callback = undefined;
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
            let aborted = error && error.message && error.message.includes("aborted");
            if (error === undefined) {
                // This is a result of reject() without parameters
                return;
            } else if (!aborted) {
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
            console.log([r.seq, "wwwwwwwwwwwwwwwww"]);
            let tmp = await r.apiPromise;
            r.apiPromise = undefined;
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


export function inference_url(addthis: string, third_party: boolean)
{
    let manual_infurl = vscode.workspace.getConfiguration().get("refactai.infurl");
    let url: string;
    if (!manual_infurl) {
        // infurl3rd changes only for debugging, user can't change it in UI, we don't advertise this variable
        let url_ = vscode.workspace.getConfiguration().get(third_party ? 'refactai.infurl3rd' : 'refactai.infurl');
        if (!url_) {
            // Backward compatibility: codify is the old name
            url_ = vscode.workspace.getConfiguration().get(third_party ? 'codify.infurl3rd' : 'codify.infurl');
        }
        if (typeof url_ !== 'string' || url_ === '' || !url_) {
            url = global_inference_url_from_login;
        } else {
            url = `${url_}`;
        }
    } else {
        // If manual, then only the specified manual
        url = `${manual_infurl}`;
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


export function rust_url(addthis: string)
{
    if (!global.rust_binary_blob) {
        return "";
    }
    let url = global.rust_binary_blob.rust_url();
    while (url.endsWith("/")) {
        url = url.slice(0, -1);
    }
    url += addthis;
    return url;
}


export let non_verifying_ctx = fetchH2.context({
    session: {
        rejectUnauthorized: false,
        sessionTimeout: 600,
    },
});


export function inference_context(third_party: boolean)
{
    let modified_url = vscode.workspace.getConfiguration().get('refactai.infurl');
    if (!modified_url) {
        // Backward compatibility: codify is the old name
        modified_url = vscode.workspace.getConfiguration().get('codify.infurl');
    }
    // If user has modified the URL, we don't check the certificate, because we assume it's self-signed self-hosted server.
    // Unless it's a third party request -- that always has a valid certificate.
    let dont_check_certificate: boolean = !third_party && !!modified_url;
    if (dont_check_certificate) {
        return non_verifying_ctx;
    } else {
        return {
            disconnect: fetchH2.disconnect,
            disconnectAll: fetchH2.disconnectAll,
            fetch: fetchH2.fetch,
            onPush: fetchH2.onPush,
            setup: fetchH2.setup,
        };
    }
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
    third_party: boolean = false,
): [Promise<fetchH2.Response>, estate.ApiFields]
{
    let url = inference_url("/v1/contrast", third_party);
    let ctx = inference_context(third_party);
    let model_ = vscode.workspace.getConfiguration().get('refactai.model') || "CONTRASTcode";
    let model_longthink: string = vscode.workspace.getConfiguration().get('refactai.longthinkModel') || suggest_longthink_model;
    if (suggest_longthink_model && suggest_longthink_model !== "CONTRASTcode") {
        model_ = model_longthink;
    }
    vscode.workspace.getConfiguration().update("files.autoSave", "off", true); // otherwise diffs do not work properly
    let model: string = `${model_}`;
    const apiKey = userLogin.secret_api_key();
    if (!apiKey) {
        return [Promise.reject("No API key"), new estate.ApiFields()];
    }
    let temp = 0.2;  // vscode.workspace.getConfiguration().get('codify.temperature');
    let client_version = vscode.extensions.getExtension("smallcloud.refact")!.packageJSON.version;
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
    let promise = ctx.fetch(req, init);
    return [promise, api_fields];
}


export function fetch_code_completion(
    cancelToken: vscode.CancellationToken,
    sources: { [key: string]: string },
    multiline: boolean,
    cursor_file: string,
    cursor_line: number,
    cursor_character: number,
    max_new_tokens: number,
    api_fields: estate.ApiFields,
): Promise<fetchH2.Response>
{
    let url = rust_url("/v1/code-completion");
    if (!url) {
        console.log(["fetch_code_completion: No rust binary working"]);
        return Promise.reject("No rust binary working");
    }
    let third_party = false;
    let ctx = inference_context(third_party);
    let model: string = vscode.workspace.getConfiguration().get('refactai.model') || "";
    const apiKey = userLogin.secret_api_key();
    if (!apiKey) {
        return Promise.reject("No API key");
    }
    let temp = 0.2;
    let client_version = vscode.extensions.getExtension("smallcloud.refact")!.packageJSON.version;
    api_fields.scope = "code-completion";
    api_fields.url = url;
    api_fields.model = model;
    api_fields.sources = sources;
    api_fields.intent = "";
    api_fields.function = "completion";
    api_fields.cursor_file = cursor_file;
    api_fields.cursor_pos0 = -1;
    api_fields.cursor_pos1 = -1;
    api_fields.ts_req = Date.now();
    const post = JSON.stringify({
        "model": model,
        "inputs": {
            "sources": sources,
            "cursor": {
                "file": cursor_file,
                "line": cursor_line,
                "character": cursor_character,
            },
            "multiline": multiline,
        },
        "parameters": {
            "temperature": temp,
            "max_new_tokens": max_new_tokens,
        },
        "client": `vscode-${client_version}`,
    });
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
    };
    let req = new fetchH2.Request(url, {
        method: "POST",
        headers: headers,
        body: post,
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
    let promise = ctx.fetch(req, init);
    return promise;
}


export function fetch_chat_promise(
    cancelToken: vscode.CancellationToken,
    scope: string,
    messages: [string, string][],
    model: string,
    third_party: boolean = false,
): [Promise<fetchH2.Response>, estate.ApiFields]
{
    let url = rust_url("/v1/chat");
    if (!url) {
        console.log(["fetch_code_completion: No rust binary working"]);
        return [Promise.reject("No rust binary working"), new estate.ApiFields()];
    }
    const apiKey = userLogin.secret_api_key();
    if (!apiKey) {
        return [Promise.reject("No API key"), new estate.ApiFields()];
    }
    let ctx = inference_context(third_party);
    let api_fields = new estate.ApiFields();
    api_fields.scope = scope;
    api_fields.url = url;
    api_fields.function = "chat";
    api_fields.ts_req = Date.now();
    api_fields.model = model;
    let json_messages = [];
    for (let i=0; i<messages.length; i++) {
        json_messages.push({
            "role": messages[i][0],
            "content": messages[i][1],
        });
    }
    const body = JSON.stringify({
        "messages": json_messages,
        "model": model,
        "parameters": {
            "max_new_tokens": 1000,
        },
        "stream": true,
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
            console.log(["chat cancelled"]);
            abort.abort();
        });
        init.signal = abort.signal;
    }
    let promise = ctx.fetch(req, init);
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
        if (typeof json.error === "string") {
            usageStats.report_success_or_failure(false, scope, url, json.error, "");
        } else {
            usageStats.report_success_or_failure(false, scope, url, json.error.message, "");
        }
    }
    return false;
}
