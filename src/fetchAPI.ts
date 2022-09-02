/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetchH2 from 'fetch-h2';


let globalSeq = 100;


export class PendingRequest {
    seq: number;
    apiPromise: Promise<any> | undefined;
    cancelToken: vscode.CancellationToken;
    cancellationTokenSource: vscode.CancellationTokenSource | undefined;

    constructor(apiPromise: Promise<any> | undefined, cancelToken: vscode.CancellationToken) {
        this.seq = globalSeq++;
        this.apiPromise = apiPromise;
        this.cancelToken = cancelToken;
    }

    supplyStream(h2stream: Promise<fetchH2.Response>)
    {
        h2stream.catch((error) => {
            if (!error.message.includes("aborted")) {
                console.log(["STREAM ERROR2", this.seq, error]);
            } else {
            }
            return;
        });
        this.apiPromise = new Promise((resolve, reject) => {
            h2stream.then((result_stream) => {
                let json = result_stream.json();
                json.then((result) => {
                    resolve(result);
                }).catch((error) => {
                    // this happens!
                    console.log(["JSON ERROR", this.seq, error]);
                    reject(error);
                });
            }).catch((error) => {
                if (!error.message.includes("aborted")) {
                    console.log(["STREAM ERROR1", this.seq, error]);
                }
                reject(error);
            });
        }).finally(() => {
            let index = globalRequests.indexOf(this);
            if (index >= 0) {
                globalRequests.splice(index, 1);
            }
            // console.log(["--pendingRequests", globalRequests.length, request.seq]);
        }).catch((error) => {
            // just print message
            console.log(["API ERROR", this.seq, error]);
        });
        globalRequests.push(this);
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
    const url = "https://inference.smallcloud.ai/v1/contrast";
    // const url = window.env.get("plugin-vscode.contrastUrl");
    let model = vscode.workspace.getConfiguration().get('codify.model');
    if(!model && model === '') {
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
    let apiKey = vscode.workspace.getConfiguration().get('codify.apiKey');
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


export async function report_to_mothership(
    positive: boolean,
    sources: { [key: string]: string },
    results: { [key: string]: string },
    intent: string,
    functionName: string,
    cursor_file: string,
    cursor_pos0: number,
    cursor_pos1: number,
    // TODO: user thought for N seconds
) {
    const url = "https://inference.smallcloud.ai/v1/report-to-mothership";
    const body = JSON.stringify({
        "positive": positive,
        "sources": sources,
        "results": results,
        "intent": intent,
        "function": functionName,
        "cursor_file": cursor_file,
        "cursor0": cursor_pos0,
        "cursor1": cursor_pos1,
    });
    let apiKey = vscode.workspace.getConfiguration().get('codify.apiKey');
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
