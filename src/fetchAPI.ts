/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetchH2 from 'fetch-h2';


let globalSeq = 100;


export class PendingRequest {
    seq: number;
    apiPromise: Promise<any> | undefined;
    cancelToken: vscode.CancellationToken;

    constructor(apiPromise: Promise<any> | undefined, cancelToken: vscode.CancellationToken) {
        this.seq = globalSeq++;
        this.apiPromise = apiPromise;
        this.cancelToken = cancelToken;
    }

    supplyStream(h2stream: Promise<fetchH2.Response>)
    {
        h2stream.catch((error) => {
            console.log(["Error after start", this.seq, error]);
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
                console.log(["STREAM ERROR", this.seq, error]);
                reject(error);
            });
        }).finally(() => {
            let index = globalRequests.indexOf(this);
            if (index >= 0) {
                globalRequests.splice(index, 1);
            }
            // console.log(["--pendingRequests", globalRequests.length, request.seq]);
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


export function fetchAPI(
    sources: { [key: string]: string },
    intent: string,
    functionName: string,
    cursorFile: string,
    cursor0: number,
    cursor1: number,
    maxTokens: number,
    maxEdits: number,
) {
    const url = "https://inference.smallcloud.ai/v1/contrast";
    // const url = window.env.get("plugin-vscode.contrastUrl");
    const body = JSON.stringify({
        "model": vscode.workspace.getConfiguration().get('mate.model'),
        "sources": sources,
        "intent": intent,
        "function": functionName,
        "cursor_file": cursorFile,
        "cursor0": cursor0,
        "cursor1": cursor1,
        "temperature": 0.2,
        "max_tokens": maxTokens,
        "max_edits": maxEdits
    });
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer AAA1337`,
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
    return promise;
}
