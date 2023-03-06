/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
// import * as chat from "./chat";
import { marked } from 'marked'; // Markdown parser documentation: https://marked.js.org/


type Rule = {
    value: number;
    name: string;
    short_description: string;
    long_description: string;
};

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

        panel.webview.onDidReceiveMessage((data) => {
			switch (data.type) {
				case "question-posted-within-tab": {
                    this.chat_post_question(panel, data.value);
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

    static chat_post_question(panel: vscode.WebviewPanel, question: string)
    {
        if(!panel) {
            return false;
        }
        panel.webview.postMessage({ command: "chat-post-question", value: {question: question}});
        panel.webview.postMessage({ command: "chat-post-answer", value: {answer: "42"}});
        setTimeout(() => {
            panel.webview.postMessage({ command: "chat-post-answer", value: {answer: "4210"}});
        }, 1000);
        setTimeout(() => {
            const html = marked.parse('# Marked in Node.js\n\nRendered by **marked**. Question originally asked: ' + question + '.');
            panel.webview.postMessage({ command: "chat-post-answer", value: {answer: html}});
        }, 2000);
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
