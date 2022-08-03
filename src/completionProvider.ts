/* eslint-disable @typescript-eslint/naming-convention */
import {
    CancellationToken,
    Position,
    TextDocument,
    InlineCompletionContext,
    InlineCompletionItemProvider,
    InlineCompletionItem,
    InlineCompletionList,
    ProviderResult,
    Range,
    Command,
    window,
    InlineCompletionTriggerKind,
    commands
} from "vscode";
import {fetchAPI} from "./fetchAPI";


// let pendingRequests = 0;
let globalSeq = 100;


class PendingRequest {
	seq: number;
	// optional
	apiPromise: Promise<any> | undefined;
	cancelToken: CancellationToken;

	constructor(apiPromise: Promise<any> | undefined, cancelToken: CancellationToken) {
		this.seq = globalSeq++;
		this.apiPromise = apiPromise;
		this.cancelToken = cancelToken;
	}
}


let globalRequests: PendingRequest[] = [];


export class MyInlineCompletionProvider implements InlineCompletionItemProvider
{
    async provideInlineCompletionItems(
        document: TextDocument,
        position: Position,
        context: InlineCompletionContext,
        cancelToken: CancellationToken
    )
    {
        console.log(["provideInlineCompletionItems", position.line, position.character, context.triggerKind]);
		// if (cancelToken) {
			// let abort = new fetchH2.AbortController();
			// cancelToken.onCancellationRequested(() => {
			// 	console.log(["User canceled inline completion"]);
			// });
			// init.signal = abort.signal;
		// }
        let whole_doc = document.getText();
        let cursor = document.offsetAt(position);
        let file_name = document.fileName;
        let sources: { [key: string]: string } = {};
        sources[file_name] = whole_doc;
        let max_tokens = 50;

		for (let i=0; i<globalRequests.length; i++) {
			let r = globalRequests[i];
			if (r.apiPromise !== undefined) {
				let tmp = await r.apiPromise;
				console.log([r.seq, "wwwwwwwwwwwwwwwww", tmp]);
			}
		}

		let request = new PendingRequest(undefined, cancelToken);
		if (cancelToken.isCancellationRequested) {
			return;
		}
		try {
			console.log(["LAUNCH", request.seq, 'active reqs', globalRequests.length]);
			let streamPromise = fetchAPI(
				sources,
				"Fix",
				// "diff-atcursor",
				"infill",
				file_name,
				cursor,
				cursor,
				max_tokens,
				1
			);
			streamPromise.catch((error) => {
				console.log(["Error after start", request.seq, error]);
				return;
			});
			request.apiPromise = new Promise((resolve, reject) => {
				streamPromise.then((result_stream) => {
					let json = result_stream.json();
					json.then((result) => {
						resolve(result);
					}).catch((error) => {
						// this happens!
						console.log(["JSON ERROR", request.seq, error]);
						reject(error);
					});
				}).catch((error) => {
					console.log(["STREAM ERROR", request.seq, error]);
					reject(error);
				});
			}).finally(() => {
				let index = globalRequests.indexOf(request);
				if (index >= 0) {
					globalRequests.splice(index, 1);
				}
				console.log(["--pendingRequests", globalRequests.length, request.seq]);
			});
			globalRequests.push(request);
			console.log(["++pendingRequests", globalRequests.length, request.seq]);
		} catch (err: unknown) {
			console.log(["catched", request.seq, err]);
		}

		let json: any = await request.apiPromise;
        let modif_doc = json["choices"][0]["files"][file_name];
        let before_cursor1 = whole_doc.substring(0, cursor);
        let before_cursor2 = modif_doc.substring(0, cursor);
        if (before_cursor1 !== before_cursor2) {
            console.log("before_cursor1 != before_cursor2");
            return { items: [] };
        }
        let stop_at = 0;
        for (let i = -1; i > -whole_doc.length; i--) {
            let char1 = whole_doc.slice(i, i + 1);
            let char2 = modif_doc.slice(i, i + 1);
            // console.log("i", i, "char1", char1, "char2", char2);
            if (char1 !== char2) {
                stop_at = i + 1;
                break;
            }
        }
        if (stop_at === 0) {
            console.log("stop_at == 0");
            return { items: [] };
        }
        // console.log("modif_doc == ", modif_doc);
        // console.log("cursor", cursor, "stop_at", stop_at, "modif_doc.length", modif_doc.length);

        let completion = modif_doc.substring(cursor, modif_doc.length + stop_at + 1);
        console.log(["SUCCESS", request.seq, completion]);

        let completionItem = new InlineCompletionItem(
            completion,
            new Range(position, position.translate(0, completion.length))
        );
        completionItem.filterText = completion;
        completionItem.command = {
            title: "hello world2",
            command: "plugin-vscode.inlineAccepted",
            arguments: [completionItem]
        };

		// if (request.cancelToken.isCancellationRequested) {
		// 	console.log([request.seq, "Func stack cancelled"]);
		// 	return { items: [] };
		// }

        return [completionItem];
    }
}
