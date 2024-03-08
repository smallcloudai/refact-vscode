/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as estate from "./estate";
import * as storeVersions from "./storeVersions";
import * as privacy from "./privacy";
import * as fetchAPI from "./fetchAPI";
import * as fetchH2 from 'fetch-h2';
import {
	EVENT_NAMES_TO_STATISTIC,
	type ReceiveFillInTheMiddleData,
	type ReceiveFillInTheMiddleDataError,
    type ChatContextFile,
} from "refact-chat-js/dist/events";


export class MyInlineCompletionProvider implements vscode.InlineCompletionItemProvider
{
    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        cancelToken: vscode.CancellationToken
    )
    {
        let state = estate.state_of_document(document);
        if (state) {
            if (state.get_mode() !== estate.Mode.Normal && state.get_mode() !== estate.Mode.Highlight) {
                return [];
            }
        }
        let access_level = await privacy.get_file_access(document.fileName);
        if (access_level < 1) {
            return [];
        }
        let pause_completion = vscode.workspace.getConfiguration().get('refactai.pauseCompletion');
        if (pause_completion && context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
            return [];
        }

        let file_name = storeVersions.filename_from_document(document);
        let current_line = document.lineAt(position.line);
        let left_of_cursor = current_line.text.substring(0, position.character);
        let right_of_cursor = current_line.text.substring(position.character);
        let right_of_cursor_has_only_special_chars = Boolean(right_of_cursor.match(/^[:\s\t\n\r(){},."'\];]*$/));
        if (!right_of_cursor_has_only_special_chars) {
            return [];
        }
        let multiline = left_of_cursor.replace(/\s/g, "").length === 0;
        let whole_doc = document.getText();
        if (whole_doc.length > 180*1024) { // Too big (180k is ~0.2% of all files on our dataset) everything becomes heavy: network traffic, cache, cpu
            return [];
        }

        let debounce_if_not_cached = context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic;
        let called_manually = context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke;

        let completion = "";
        let corrected_cursor_character = 0;
        if (!multiline) {
            // VS Code uses UCS-2 or some older encoding internally, so emojis, Chinese characters, are more than one char
            // according to string.length
            let replace_emoji_with_one_char = left_of_cursor.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, " ");
            corrected_cursor_character = position.character;
            corrected_cursor_character -= left_of_cursor.length - replace_emoji_with_one_char.length;
        }

        let this_completion_serial_number = 6000;
        [completion, this_completion_serial_number] = await this.cached_request(
            cancelToken,
            file_name,
            whole_doc,
            position.line,
            corrected_cursor_character,
            debounce_if_not_cached,
            multiline,
            called_manually,
        );

        let command = {
            command: "refactaicmd.inlineAccepted",
            title: "inlineAccepted",
            arguments: [this_completion_serial_number],
        };

        let replace_range0 = new vscode.Position(position.line, position.character);
        let replace_range1 = new vscode.Position(position.line, current_line.text.length);
        if (multiline) {
            replace_range0 = new vscode.Position(position.line, 0);
        }
        console.log([
            "completion", completion,
            "replace_range0", replace_range0.line, replace_range0.character,
            "replace_range1", replace_range1.line, replace_range1.character,
        ]);
        let completionItem = new vscode.InlineCompletionItem(
            completion,
            new vscode.Range(replace_range0, replace_range1),
            command,
        );
        return [completionItem];
    }

    async cached_request(
        cancelToken: vscode.CancellationToken,
        file_name: string,
        whole_doc: string,
        cursor_line: number,
        cursor_character: number,
        debounce_if_not_cached: boolean,
        multiline: boolean,
        called_manually: boolean
    ): Promise<[string, number]>
    {
        if (!global.have_caps) {
            await global.rust_binary_blob?.read_caps();
        }
        // if (debounce_if_not_cached) {
        //     let drop = await this.slowdown(cancelToken);
        //     if (drop) { return ["", -1]; }
        // }
        if (cancelToken.isCancellationRequested) {
            return ["", -1];
        }

        let request = new fetchAPI.PendingRequest(undefined, cancelToken);
        let max_tokens = vscode.workspace.getConfiguration().get('refactai.completionMaxTokens');
        if (!max_tokens) {
            max_tokens = 50;
        }

        let sources: { [key: string]: string } = {};
        sources[file_name] = whole_doc;

        let t0 = Date.now();
        let promise: any;
        let no_cache = called_manually;
        promise = fetchAPI.fetch_code_completion(
            cancelToken,
            sources,
            multiline,
            file_name,
            cursor_line,
            cursor_character,
            max_tokens,
            no_cache,
        );
        request.supply_stream(promise, "completion", "");
        let json: any;
        json = await request.apiPromise;
        if (json === undefined) {
            return ["", -1];
        }
        let t1 = Date.now();
        let ms_int = Math.round(t1 - t0);
        console.log([`API request ${ms_int}ms`]);

        let completion = json["choices"][0]["code_completion"];
        if (completion === undefined || completion === "" || completion === "\n") {
            console.log(["completion is empty", completion]);
            return ["", -1];
        }
        let de_facto_model = json["model"];
        let serial_number = json["snippet_telemetry_id"];
        let maybeContext = json["context"] ?? null;
        this.maybeSendContextToSideBar(maybeContext);
        global.status_bar.completion_model_worked(de_facto_model);
        return [completion, serial_number];
    }

	maybeSendContextToSideBar(
		maybeContext: { role: string; content: string; }[] | null
	) {
		if (maybeContext !== null && global.side_panel?._view) {
			try {
				const contextFiles: ChatContextFile[] = maybeContext
					.filter((x) => x.role === "context_file")
					.map((message) => {
                        if(typeof message.content === "string"){
						    return JSON.parse(message.content) as ChatContextFile;
                        } else {
                            return message.content
                        }
					});

				const message: ReceiveFillInTheMiddleData = {
					type: EVENT_NAMES_TO_STATISTIC.RECEIVE_FILL_IN_THE_MIDDLE_DATA,
					payload: { files: contextFiles },
				};
				global.side_panel?._view?.webview.postMessage(message);
			} catch (e: unknown) {
				const message: ReceiveFillInTheMiddleDataError = {
					type: EVENT_NAMES_TO_STATISTIC.RECEIVE_FILL_IN_THE_MIDDLE_DATA_ERROR,
					payload: { message: JSON.stringify(e) },
				};
				global.side_panel?._view?.webview.postMessage(message);
			}
		}
	}
}

export function _extract_extension(feed: estate.ApiFields)
{
    let filename_ext = feed.cursor_file.split(".");
    let ext = "None";
    if (filename_ext.length > 1) {
        let try_this = filename_ext[filename_ext.length - 1];
        if (try_this.length <= 4) {
            ext = try_this;
        }
    }
    return ext;
}


export async function inline_accepted(serial_number: number)
{
    let url = fetchAPI.rust_url("/v1/snippet-accepted");
    if (!url) {
        console.log(["Failed to get url for /v1/snippet-accepted"]);
    }
    const post = JSON.stringify({
        "snippet_telemetry_id": serial_number
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

    try {
        await fetchH2.fetch(req);
    } catch (error) {
        console.log("failed to post to /v1/snippet-accepted");
    }
}


export function inline_rejected(reason: string)
{
    // console.log(["inline_rejected", reason]);
}


export function on_cursor_moved()
{
    setTimeout(() => {
        inline_rejected("moveaway");
    }, 50);
}


export function on_text_edited()
{
    setTimeout(() => {
        inline_rejected("moveaway");
    }, 50);
}


export function on_esc_pressed()
{
    inline_rejected("esc");
}
