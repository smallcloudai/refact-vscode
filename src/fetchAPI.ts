/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetchH2 from 'fetch-h2';
import * as usabilityHints from "./usabilityHints";
import * as estate from "./estate";
import * as statusBar from "./statusBar";
import {
	type CapsResponse,
    type CustomPromptsResponse,
    ChatMessages,
} from "refact-chat-js/dist/events";


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
    streaming_error: string = "";

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
                    let my_cb = this.streaming_end_callback;
                    this.streaming_end_callback = undefined;
                    await my_cb(this.streaming_error);
                }
                break;
            }
            if (to_eat === "[ERROR]") {
                console.log("Streaming error");
                this.streaming_error = "[ERROR]";
                break;
            }
            let json = JSON.parse(to_eat);
            let error_detail = json["detail"];
            if (typeof error_detail === "string") {
                this.streaming_error = error_detail;
                break;
            }
            if (this.streaming_callback) {
                await this.streaming_callback(json);
            }
        }
    }

    supply_stream(h2stream: Promise<fetchH2.Response>, scope: string, url: string)
    {
        this.streaming_error = "";
        h2stream.catch((error) => {
            let aborted = error && error.message && error.message.includes("aborted");
            if (!aborted) {
                console.log(["h2stream error (1)", error]);
                statusBar.send_network_problems_to_status_bar(false, scope, url, error, "");
            } else {
                // Normal, user cancelled the request.
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
                            let error_message: string;
                            try {
                                let j = JSON.parse(this.streaming_buf);
                                error_message = j["detail"];
                                if (typeof error_message !== "string") {
                                    error_message = this.streaming_buf;
                                }
                            } catch (e) {
                                console.log(["error parsing error json", e]);
                                error_message = this.streaming_buf; // as a string
                            }
                            this.streaming_error = error_message;
                            // statusBar.send_network_problems_to_status_bar(false, scope, url, this.streaming_buf, "");
                        } else if (this.streaming_error) {
                            // statusBar.send_network_problems_to_status_bar(false, scope, url, "streaming_error", "");
                        } else {
                            // statusBar.send_network_problems_to_status_bar(true, scope, url, "", "");
                        }
                        // Normally [DONE] produces a callback, but it's possible there's no [DONE] sent by the server.
                        // Wait 500ms because inside VS Code "readable" and "end"/"close" are sometimes called in the wrong order.
                        await new Promise(resolve => setTimeout(resolve, 500));
                        if (this.streaming_end_callback) {
                            let my_cb = this.streaming_end_callback;
                            this.streaming_end_callback = undefined;
                            await my_cb(this.streaming_error);
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
                    if (look_for_common_errors(json_arrived, scope, "")) {
                        reject();
                        return;
                    }
                    let model_name = json_arrived["model"];
                    if (typeof json_arrived === "object" && json_arrived.length !== undefined) {
                        model_name = json_arrived[0]["model"];
                    }
                    statusBar.send_network_problems_to_status_bar(true, scope, url, "", model_name);
                    resolve(json_arrived);
                }
            }).catch(async (error) => {
                let aborted = error && error.message && error.message.includes("aborted");
                if (!aborted) {
                    console.log(["h2stream error (2)", error]);
                    statusBar.send_network_problems_to_status_bar(false, scope, url, error, "");
                }
                if (this.streaming_end_callback) {
                    let my_cb = this.streaming_end_callback;
                    this.streaming_end_callback = undefined;
                    await my_cb(error !== undefined);
                }
                reject();
            });
        }).finally(() => {
            let index = _global_reqs.indexOf(this);
            if (index >= 0) {
                _global_reqs.splice(index, 1);
            }
            if (_global_reqs.length === 0) {
                global.status_bar.statusbar_spinner(false);
            }
            // console.log(["--pendingRequests", _global_reqs.length, request.seq]);
        }).catch((error) => {
            let aborted = error && error.message && error.message.includes("aborted");
            if (error === undefined) {
                // This is a result of reject() without parameters
                return;
            } else if (!aborted) {
                console.log(["h2stream error (3)", error]);
                statusBar.send_network_problems_to_status_bar(false, scope, url, error, "");
            }
        });
        _global_reqs.push(this);
        global.status_bar.statusbar_spinner(true);
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


export function inference_context(third_party: boolean)
{
    // let modified_url = vscode.workspace.getConfiguration().get('refactai.infurl');
    // if (!modified_url) {
    //     // Backward compatibility: codify is the old name
    //     modified_url = vscode.workspace.getConfiguration().get('codify.infurl');
    // }
    // in previous versions, it was possible to skip certificate verification
    return {
        disconnect: fetchH2.disconnect,
        disconnectAll: fetchH2.disconnectAll,
        fetch: fetchH2.fetch,
        onPush: fetchH2.onPush,
        setup: fetchH2.setup,
    };
}


export function fetch_code_completion(
    cancelToken: vscode.CancellationToken,
    sources: { [key: string]: string },
    multiline: boolean,
    cursor_file: string,
    cursor_line: number,
    cursor_character: number,
    max_new_tokens: number,
    no_cache: boolean,
    temperature: number,
    // api_fields: estate.ApiFields,
): Promise<fetchH2.Response>
{
    let url = rust_url("/v1/code-completion");
    if (!url) {
        console.log(["fetch_code_completion: No rust binary working"]);
        return Promise.reject("No rust binary working");
    }
    let third_party = false;
    let ctx = inference_context(third_party);
    let model_name = vscode.workspace.getConfiguration().get<string>("refactai.codeCompletionModel") || "";
    let client_version = vscode.extensions.getExtension("smallcloud.codify")!.packageJSON.version;
    // api_fields.scope = "code-completion";
    // api_fields.url = url;
    // api_fields.model = model;
    // api_fields.sources = sources;
    // api_fields.intent = "";
    // api_fields.function = "completion";
    // api_fields.cursor_file = cursor_file;
    // api_fields.cursor_pos0 = -1;
    // api_fields.cursor_pos1 = -1;
    // api_fields.ts_req = Date.now();
    let use_ast = vscode.workspace.getConfiguration().get<boolean>("refactai.ast");

    const post = JSON.stringify({
        "model": model_name,
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
            "temperature": temperature,
            "max_new_tokens": max_new_tokens,
        },
        "no_cache": no_cache,
        "use_ast": use_ast,
        "client": `vscode-${client_version}`,
    });
    const headers = {
        "Content-Type": "application/json",
        // "Authorization": `Bearer ${apiKey}`,
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
        cancelToken.onCancellationRequested(async () => {
            console.log(["API fetch cancelled"]);
            abort.abort();

            global.side_panel?.chat?.handleStreamEnd();

            await fetchH2.disconnectAll();
        });
        init.signal = abort.signal;
    }
    let promise = ctx.fetch(req, init);
    return promise;
}


export function fetch_chat_promise(
    cancelToken: vscode.CancellationToken,
    scope: string,
    messages: ChatMessages | [string, string][],
    model: string,
    third_party: boolean = false,
    tools: AtToolCommand[] | null = null,
): [Promise<fetchH2.Response>, string, string]
{
    let url = rust_url("/v1/chat");
    if (!url) {
        console.log(["fetch_chat_promise: No rust binary working"]);
        return [Promise.reject("No rust binary working"), scope, ""];
    }
    const apiKey = "any-key-will-work";
    if (!apiKey) {
        return [Promise.reject("No API key"), "chat", ""];
    }

    let ctx = inference_context(third_party);

    // an empty tools array causes issues
    const maybeTools = tools && tools.length > 0 ? {tools} : {};
    const body = JSON.stringify({
        "messages": [], //json_messages,
        "model": model,
        "parameters": {
            "max_new_tokens": 1000,
        },
        "stream": true,
        ...maybeTools
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
    return [promise, scope, ""];
}


export function look_for_common_errors(json: any, scope: string, url: string): boolean
{
    if (json === undefined) {
        // undefined means error is already handled, do nothing
        return true;
    }
    if (json.detail) {
        statusBar.send_network_problems_to_status_bar(false, scope, url, json.detail, "");
        return true;
    }
    if (json.retcode && json.retcode !== "OK") {
        statusBar.send_network_problems_to_status_bar(false, scope, url, json.human_readable_message, "");
        return true;
    }
    if (json.error) {
        if (typeof json.error === "string") {
            statusBar.send_network_problems_to_status_bar(false, scope, url, json.error, "");
        } else {
            statusBar.send_network_problems_to_status_bar(false, scope, url, json.error.message, "");
        }
    }
    return false;
}

export async function get_caps(): Promise<CapsResponse> {
  let url = rust_url("/v1/caps");
  if (!url) {
    return Promise.reject("read_caps no rust binary working, very strange");
  }

  let req = new fetchH2.Request(url, {
    method: "GET",
    redirect: "follow",
    cache: "no-cache",
    referrer: "no-referrer",
  });

  let resp = await fetchH2.fetch(req);
  if (resp.status !== 200) {
    console.log(["read_caps http status", resp.status]);
    return Promise.reject("read_caps bad status");
  }
  let json = await resp.json();
  console.log(["successful read_caps", json]);
  return json as CapsResponse;
}

export async function get_prompt_customization(): Promise<CustomPromptsResponse> {
    const url = rust_url("/v1/customization");

    if (!url) {
        return Promise.reject("unable to get prompt customization");
    }

    const request = new fetchH2.Request(url, {
		method: "GET",
		redirect: "follow",
		cache: "no-cache",
		referrer: "no-referrer",
	});

    const response = await fetchH2.fetch(request);

    if (!response.ok) {
        console.log(["get_prompt_customization http status", response.status]);
        return Promise.reject("unable to get prompt customization");
    }

    const json = await response.json();

    return json;
}

export type AstStatus = {
	files_unparsed: number;
	files_total: number;
	ast_index_files_total: number;
	ast_index_symbols_total: number;
	state: "starting" | "parsing" | "indexing" | "done";
};

export interface RagStatus {
    ast: {
        files_unparsed: number;
        files_total: number;
        ast_index_files_total: number;
        ast_index_symbols_total: number;
        state: string;
        ast_max_files_hit: boolean;
    } | null;
    ast_alive: string | null;
    vecdb: {
        files_unprocessed: number;
        files_total: number;
        requests_made_since_start: number;
        vectors_made_since_start: number;
        db_size: number;
        db_cache_size: number;
        state: string;
        vecdb_max_files_hit: boolean;
    } | null;
    vecdb_alive: string | null;
    vec_db_error: string;
}

async function fetch_rag_status()
{
    const url = rust_url("/v1/rag-status");
    if(!url) {
        return Promise.reject("rag-status no rust binary working, very strange");
    }

    const request = new fetchH2.Request(url, {
        method: "GET",
        redirect: "follow",
        cache: "no-cache",
        referrer: "no-referrer",
    });

    try {
        const response = await fetchH2.fetch(request);
        if (response.status !== 200) {
            console.log(["rag-status http status", response.status]);
        }
        const json = await response.json();
        return json;
    } catch (e) {
        statusBar.send_network_problems_to_status_bar(
            false,
            "rag-status",
            url,
            e,
            undefined
        );
    }
    return Promise.reject("rag-status bad status");
}

let ragstat_timeout: NodeJS.Timeout | undefined;

export function maybe_show_rag_status(statusbar: statusBar.StatusBarMenu = global.status_bar)
{
    if (ragstat_timeout) {
        clearTimeout(ragstat_timeout);
        ragstat_timeout = undefined;
    }

    fetch_rag_status()
        .then((res: RagStatus) => {
            if (res.ast && res.ast.ast_max_files_hit) {
                statusbar.ast_status_limit_reached();
                ragstat_timeout = setTimeout(() => maybe_show_rag_status(statusbar), 5000);
                return;
            }

            if (res.vecdb && res.vecdb.vecdb_max_files_hit) {
                statusbar.vecdb_status_limit_reached();
                ragstat_timeout = setTimeout(() => maybe_show_rag_status(statusbar), 5000);
                return;
            }

            statusbar.ast_limit_hit = false;
            statusbar.vecdb_limit_hit = false;

            if (res.vec_db_error !== '') {
                statusbar.vecdb_error(res.vec_db_error);
            }

            if ((res.ast && ["starting", "parsing", "indexing"].includes(res.ast.state)) ||
                (res.vecdb && ["starting", "parsing", "cooldown"].includes(res.vecdb.state)))
            {
                // console.log("ast or vecdb is still indexing");
                ragstat_timeout = setTimeout(() => maybe_show_rag_status(statusbar), 700);
            } else {
                // console.log("ast and vecdb status complete, slowdown poll");
                statusbar.statusbar_spinner(false);
                ragstat_timeout = setTimeout(() => maybe_show_rag_status(statusbar), 5000);
            }
            statusbar.update_rag_status(res);
        })
        .catch((err) => {
            console.log("fetch_rag_status", err);
            ragstat_timeout = setTimeout(() => maybe_show_rag_status(statusbar), 5000);
        });
}

type AtParamDict = {
    name: string;
    type: string;
    description: string;
};

// TODO: align with new /v1/tools response format if necessary

/**
 * @deprecated
 */
type AtToolFunction = {
    name: string;
    agentic: boolean;
    description: string;
    parameters: AtParamDict[];
    parameters_required: string[];
};

/**
 * @deprecated
 */
type AtToolCommand = {
    function: AtToolFunction;
    type: "function";
};

/**
 * @deprecated
 */
type AtToolResponse = AtToolCommand[];

export async function get_tools(notes: boolean = false): Promise<AtToolResponse> {
    const url = rust_url("/v1/tools");

    if (!url) {
        return Promise.reject("unable to get tools url");
    }
	const request = new fetchH2.Request(url, {
        method: "GET",
        redirect: "follow",
		cache: "no-cache",
		referrer: "no-referrer",
    });


    const response = await fetchH2.fetch(request);

    if (!response.ok) {
        console.log(["tools response http status", response.status]);

        // return Promise.reject("unable to get available tools");
        return [];
    }

    const json: AtToolResponse = await response.json();

    const tools = notes ?
        json.filter((tool) => tool.function.name === "note_to_self") :
        json.filter((tool) => tool.function.name !== "note_to_self");

    return tools;
}


export async function lsp_set_active_document(editor: vscode.TextEditor)
{
    let url = rust_url("/v1/lsp-set-active-document");
    if (url) {
        const post = JSON.stringify({
            "uri": editor.document.uri.toString(),
        });
        const headers = {
            "Content-Type": "application/json",
        };
        let req = new fetchH2.Request(url, {
            method: "POST",
            headers: headers,
            body: post,
            redirect: "follow",
            cache: "no-cache",
            referrer: "no-referrer"
        });
        fetchH2.fetch(req).then((response) => {
            if (!response.ok) {
                console.log(["lsp-set-active-document failed", response.status, response.statusText]);
            } else {
                console.log(["lsp-set-active-document success", response.status]);
            }
        });
    }
}
