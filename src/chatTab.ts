/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
// import * as chat from "./chat";
import * as fetchAPI from "./fetchAPI";
import * as userLogin from "./userLogin";
import { marked } from 'marked'; // Markdown parser documentation: https://marked.js.org/


export class ChatTab {
    public static currentPanel: ChatTab | undefined;
    // private _editor = vscode.window.activeTextEditor;
    public static _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: any)
    {
        ChatTab._panel = panel;
        ChatTab._panel.webview.html = ChatTab.get_html_for_webview(
            ChatTab._panel.webview,
            extensionUri,
            context
        );
    }

    public static activate_from_outside(context: any, question: string)
    {
        const panel = vscode.window.createWebviewPanel(
            "codify-chat-tab",
            "Codify Chat BBB",
            vscode.ViewColumn.One,
            {
                enableScripts: true,
            }
        );

        ChatTab.currentPanel = new ChatTab(panel, context.extensionUri, context);
        const question_clean = question.endsWith('?') ? question.slice(0, -1) : question;
        this.chat_post_question(panel, question_clean);

        panel.webview.onDidReceiveMessage(async (data) => {
			switch (data.type) {
				case "question-posted-within-tab": {
                    await this.chat_post_question(panel, data.value);
                    break;
				}
			}
		});
    }

    public dispose()
    {
        ChatTab.currentPanel = undefined;

        ChatTab._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    static async chat_post_question(panel: vscode.WebviewPanel, question: string)
    {
        if(!panel) {
            return false;
        }
        panel.webview.postMessage({ command: "chat-post-question", value: {question: question}});
        let login = await userLogin.inference_login();
        if (!login) {
            panel.webview.postMessage({ command: "chat-post-answer", value: {answer: "Please login first."}});
            return;
        }
        panel.webview.postMessage({ command: "chat-post-answer", value: {answer: "⏳"}});
        await fetchAPI.wait_until_all_requests_finished();

        let answer = "";
        async function _streaming_callback(json: any)
        {
            if (json === undefined) {
                return;
            }
            if (cancelToken.isCancellationRequested) {
                console.log(["chat request is cancelled, new data is coming", json]);
                return;
            } else {
                if (json && json["delta"]) {
                    answer += json["delta"];
                    let valid_html = false;
                    let html = "";
                    try {
                        html = marked.parse(answer);
                        valid_html = true;
                    } catch (e) {
                        valid_html = false;
                    }
                    if (valid_html) {
                        panel.webview.postMessage({ command: "chat-post-answer", value: {answer: html}});
                    }
                }
            }
        }

        async function _streaming_end_callback()
        {
            console.log("streaming end callback");
        }

        let cancellationTokenSource = new vscode.CancellationTokenSource();
        let cancelToken = cancellationTokenSource.token;
        let request = new fetchAPI.PendingRequest(undefined, cancelToken);
        request.set_streaming_callback(_streaming_callback, _streaming_end_callback);

        const max_tokens = 200;
        request.supply_stream(...fetchAPI.fetch_chat_promise(
            cancelToken,
            "chat-tab",
            [["user", question]],
            "freechat",
            max_tokens,
            [],
        ));
    }

    static get_html_for_webview(
        webview: vscode.Webview,
        extensionUri: any,
        cnt: any
    ): string
    {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "assets", "chat.js")
        );
        const styleMainUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "assets", "chat.css")
        );

        const nonce = ChatTab.getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <!--
                    Use a content security policy to only allow loading images from https or from our extension directory,
                    and only allow scripts that have a specific nonce.
                -->
                <meta http-equiv="Content-Security-Policy" content="style-src ${webview.cspSource}; img-src 'self' data: https:; script-src 'nonce-${nonce}'; style-src-attr 'sha256-tQhKwS01F0Bsw/EwspVgMAqfidY8gpn/+DKLIxQ65hg=' 'unsafe-hashes';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">

                <title>Codify Chat AAA</title>
                <link href="${styleMainUri}" rel="stylesheet">
            </head>
            <body>
                <div class="codify-chat">
                    <h1 class="codify-chat__title">Codify Chat CCC</h1>
                    <div class="codify-chat__content">
                    </div>
                    <div class="codify-chat__commands">
                        <textarea id="chat-input" class="codify-chat__input"></textarea>
                        <button id="chat-send" class="codify-chat__button">▷</button>
                    </div>
                </div>

                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    static getNonce()
    {
        let text = "";
        const possible =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}

export default ChatTab;
