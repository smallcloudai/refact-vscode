/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
// import * as chat from "./chat";
import * as fetchAPI from "./fetchAPI";
import * as userLogin from "./userLogin";
import { marked } from 'marked'; // Markdown parser documentation: https://marked.js.org/


export class ChatTab {
    // public static current_tab: ChatTab | undefined;
    // private _disposables: vscode.Disposable[] = [];
    public web_panel: vscode.WebviewPanel;
    public messages: [string, string][];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: any)
    {
        this.web_panel = panel;
        this.web_panel.webview.html = ChatTab.get_html_for_webview(
            this.web_panel.webview,
            extensionUri,
            context
        );
        this.messages = [];
    }

    public static activate_from_outside(context: vscode.ExtensionContext, question: string, code_snippet: string|undefined)
    {
        const panel = vscode.window.createWebviewPanel(
            "codify-chat-tab",
            question || "Codify Chat",
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        let free_floating_tab = new ChatTab(panel, context.extensionUri, context);
        // const question_clean = question.endsWith('?') ? question.slice(0, -1) : question;
        if (code_snippet) {
            question = "```\n" + code_snippet + "\n```\n" + question;
        }
        if (question) { // no question => just a button was pressed
            free_floating_tab.chat_post_question(question);
        }

        panel.webview.onDidReceiveMessage(async (data) => {
			switch (data.type) {
                case "open-new-file": {
                    vscode.workspace.openTextDocument().then((document) => {
                        vscode.window.showTextDocument(document, vscode.ViewColumn.Active).then((editor) => {
                            editor.edit((editBuilder) => {
                                editBuilder.insert(new vscode.Position(0, 0), data.value);
                            });
                        });
                    });
                    break;
                }
				case "question-posted-within-tab": {
                    await free_floating_tab.chat_post_question(data.value);
                    break;
				}
			}
		});
    }

    // public dispose()
    // {
    //     ChatTab.current_tab = undefined;
    //     this.web_panel.dispose();
    //     while (this._disposables.length) {
    //         const disposable = this._disposables.pop();
    //         if (disposable) {
    //             disposable.dispose();
    //         }
    //     }
    // }

    private _question_to_div(question: string)
    {
        let valid_html = false;
        let html = "";
        try {
            html = marked.parse(question);
            valid_html = true;
        } catch (e) {
            valid_html = false;
        }
        if (!valid_html) {
            html = question;
        }
        this.web_panel.webview.postMessage({ command: "chat-post-question", value: {question: html}});
    }

    async chat_post_question(question: string)
    {
        if(!this.web_panel) {
            return false;
        }
        let login = await userLogin.inference_login();
        if (!login) {
            this.web_panel.webview.postMessage({ command: "chat-post-answer", value: {answer: "The inference server isn't working. Possible reasons: your internet connection is down, you didn't log in, or the Codify inference server in currently experiencing issues."}});
            return;
        }

        let cancellationTokenSource = new vscode.CancellationTokenSource();
        let cancelToken = cancellationTokenSource.token;

        this.messages.push(["user", question]);
        if (this.messages.length > 10) {
            this.messages.shift();
            this.messages.shift(); // so it always starts with a user
        }
        this._question_to_div(question);
        this.web_panel.webview.postMessage({ command: "chat-post-answer", value: {answer: "⏳"}});
        await fetchAPI.wait_until_all_requests_finished();

        let answer = "";
        let stack_web_panel = this.web_panel;
        let stack_this = this;
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
                        let raw_html = answer;
                        let backtick_backtick_backtick_count = (answer.match(/```/g) || []).length;
                        if (backtick_backtick_backtick_count % 2 === 1) {
                            raw_html = answer + "\n```";
                        }
                        html = marked.parse(raw_html);
                        valid_html = true;
                    } catch (e) {
                        valid_html = false;
                    }
                    if (valid_html) {
                        stack_web_panel.webview.postMessage({ command: "chat-post-answer", value: {answer: html}});
                        // console.log(["chat answer", html]);
                    }
                }
            }
        }

        async function _streaming_end_callback()
        {
            console.log("streaming end callback");
            stack_this.messages.push(["assistant", answer]);
            stack_this.web_panel.webview.postMessage({ command: "chat-end-streaming" });
        }

        let request = new fetchAPI.PendingRequest(undefined, cancelToken);
        request.set_streaming_callback(_streaming_callback, _streaming_end_callback);

        request.supply_stream(...fetchAPI.fetch_chat_promise(
            cancelToken,
            "chat-tab",
            this.messages,
            "freechat",
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
                    <h2 class="codify-chat__title">Codify Chat</h2>
                    <div class="codify-chat__content">
                    </div>
                    <div class="codify-chat__commands">
                        <textarea id="chat-input" class="codify-chat__input"></textarea>
                        <button id="chat-send" class="codify-chat__button"><span></span></button>
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
