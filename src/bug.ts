/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as estate from "./estate";
import { fetch } from 'fetch-h2';
import * as os from 'os';

export class BugPage {
    public static currentPanel: BugPage | undefined;
    private _editor = vscode.window.activeTextEditor;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: any) {
        this._panel = panel;
        this._panel.webview.html = this._getHtmlForWebview(
            this._panel.webview,
            extensionUri,
            context
        );
    }

    public static render(context: any) {
        const panel = vscode.window.createWebviewPanel(
            "codify-bug",
            "Codify Bug Report",
            vscode.ViewColumn.One,
            {
                enableScripts: true,
            }
        );
        panel.iconPath = vscode.Uri.joinPath(
            context.extensionUri,
            "images",
            "logo-small.png"
        );

        BugPage.currentPanel = new BugPage(panel, context.extensionUri, context);

        
        panel.webview.onDidReceiveMessage((data) => {
			switch (data.type) {
				case "buttonSubmit": {
                    const sendData = BugPage.sendBugs(data.value,context,panel);
				}
			}
		});
    }


    public dispose() {
        BugPage.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    _getHtmlForWebview(webview: vscode.Webview, extensionUri: any, cnt: any) {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "assets", "bug.js")
        );
        const styleMainUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "assets", "bug.css")
        );
        const imagesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "images")
        );

        var store = cnt.globalState;
        const apiKey = store.get('codify_apiKey');

        const nonce = this.getNonce();

        let intent = estate.global_intent;
        let source; 
        let editor = this._editor;

        if(editor) {
            let doc = editor.document;
            source = doc.getText();
        }


        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <!--
                    Use a content security policy to only allow loading images from https or from our extension directory,
                    and only allow scripts that have a specific nonce.
                -->
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src 'self' data: https:; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                
                <title>Bug Report</title>
                <link href="${styleMainUri}" rel="stylesheet">
            </head>
            <body>
                <div class="container">
                    <header class="s-header">
                        <h1 class="s-header__title">
                            Bug Report
                        </h1>
                        <img class="s-header__logo" src="${imagesUri}/logo-full.svg" alt="Codify" />
                        <img class="s-header__logowhite" src="${imagesUri}/logo-full-white.svg" alt="Codify" />
                    </header>
                    <div class="s-body">
                        <div class="s-body__item">
                            <label>Comment</label>
                            <textarea id="comment" class="s-body__textarea" name="comment">
I'm using
"${intent}" and I typed "${intent}",
the expceted outcome is ...
What it really does is ...
Environment: Visual Code (${os.platform()}) - ${vscode.version}
Plugin Version: ${cnt.extension.packageJSON.version}
                            </textarea>
                        </div> 
                    </div>
                    <div class="s-footer">
                        <button class="s-submit">Submit Bug Report</button>
                    </div>
                </div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    getNonce() {
        let text = "";
        const possible =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
    static async sendBugs(data: any, cnt: any,panel: any) {
        var store = cnt.globalState;
        const slackMsg = `name: ${store.get('codify_clientName')}\napiKey: ${store.get('codify_apiKey')}\nplugin: ${cnt.extension.packageJSON.version}\nintent: ${data.intent}\nsource: ${data.source}\ncomment: ${data.comment}\nplatform: ${os.platform()}\nversion ${vscode.version}`;
        const headers = {
            "Content-Type": "application/json"
        };
        const slack = await fetch("https://hooks.slack.com/services/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", { 
            method: "POST",
            body: JSON.stringify({text: slackMsg}),
            headers: headers,
        }).then(response => {
            console.log('Slack Response',response);
        }).catch(function(error) {
            console.log('Slack Error',error);
        });

        const dataToSend = JSON.stringify({
            name: store.get('codify_clientName'),
            apiKey: store.get('codify_apiKey'),
            platform: os.platform(),
            version: vscode.version,
            plugin: cnt.extension.packageJSON.version,
            ...data
        });

        const response = await fetch( 'https://max.smallcloud.ai/codify-bug', { 
            method: "POST",
            headers: headers,
            body: dataToSend,
            redirect: "follow",
            cache: "no-cache",
            referrer: "no-referrer", 
        }).then((response) => {
            console.log('Bug Request Response',response);
            panel.webview.postMessage({ command: "sendResponse" });
        }).catch(function(error) {
            console.log('Bug Request Error',error);
        });

    }
}
export default BugPage;
