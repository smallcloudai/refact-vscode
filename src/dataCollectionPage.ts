/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as estate from "./estate";
import * as os from 'os';
import * as userLogin from "./userLogin";


export class DataReviewPage {
    public static currentPanel: DataReviewPage | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        context: any
    ) {
        this._panel = panel;
        this._panel.webview.html = this._getHtmlForWebview(
            this._panel.webview,
            extensionUri,
            context
        );
    }

    public static render(context: any)
    {
        const panel = vscode.window.createWebviewPanel(
            "codify-review-data",
            "Codify Review Data",
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
        DataReviewPage.currentPanel = new DataReviewPage(panel, context.extensionUri, context);
        panel.webview.onDidReceiveMessage((data) => {
            switch (data.type) {
            case "buttonSubmit": {
                const sendData = DataReviewPage.sendBugs(data.value,context,panel);
            }
            }
        });
    }

    public dispose()
    {
        DataReviewPage.currentPanel = undefined;
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

        // let intent = estate.global_intent;
        // let func = global.modelFunction;
        // if(func === 'undefined' || func === undefined){
        //     func = 'completion';
        // }
        // const lastEditor =  global.lastEditor;
        // let file = null;
        // let fileBlock = '';
        // if(lastEditor) {
        //     file = global.lastEditor.fileName.split("/");
        //     fileBlock = `<div class="s-body__item s-body__item--inline"><input type="checkbox" id="source" name="source"><label for="source">Attach ${file[file.length - 1]}</label></div>`;
        // }
        let func = "aaa";
        let intent = "bbb";
        let fileBlock = "xxx";

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

                <title>Data Review</title>
                <link href="${styleMainUri}" rel="stylesheet">
            </head>
            <body>
                <div class="container">
                    <header class="s-header">
                        <h1 class="s-header__title">
                            Data Review
                        </h1>
                        <img class="s-header__logo" src="${imagesUri}/logo-full.svg" alt="Codify" />
                        <img class="s-header__logowhite" src="${imagesUri}/logo-full-white.svg" alt="Codify" />
                    </header>
                    <div class="s-body">
                        <div class="s-body__item">
                            <label>Comment</label>
                            <textarea data-function="${func}" data-intent="${intent}" id="comment" class="s-body__textarea" name="comment">
I'm using "${func}"
and I typed "${intent}",
the expected outcome is ...
What it really does is ...

Environment: Visual Code (${os.platform()}) - ${vscode.version}
Plugin Version: ${cnt.extension.packageJSON.version}</textarea>
                        </div>
                            ${fileBlock}
                    </div>
                    <div class="s-footer">
                        <button class="s-submit">Experiment!</button>
                    </div>
                </div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    getNonce()
    {
        let text = "";
        const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    static async sendBugs(data: any, cnt: any,panel: any)
    {
    }
}

