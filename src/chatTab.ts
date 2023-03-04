/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as chat from "./chat";

type Rule = {
    value: number;
    name: string;
    short_description: string;
    long_description: string;
};

export class ChatTab {
    public static currentPanel: ChatTab | undefined;
    private _editor = vscode.window.activeTextEditor;
    public static _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: any) {
        ChatTab._panel = panel;
        ChatTab._panel.webview.html = ChatTab.getHtmlForWebview(
            ChatTab._panel.webview,
            extensionUri,
            context
        );
    }

    public static render(context: any) {
        const panel = vscode.window.createWebviewPanel(
            "codify-chat-tab",
            "Codify Chat",
            vscode.ViewColumn.One,
            {
                enableScripts: true,
            }
        );
        // panel.iconPath = vscode.Uri.joinPath(
        //     context.extensionUri,
        //     "images",
        //     "logo-small.png"
        // );

        ChatTab.currentPanel = new ChatTab(panel, context.extensionUri, context);


        // panel.webview.onDidReceiveMessage((data) => {
		// 	switch (data.type) {
		// 		case "globalDefault": {
        //             chat.set_global_access(Number(data.value));
        //             this.update_webview(panel);
        //             break;
		// 		}
		// 		case "deleteOverride": {
        //             // console.log(data);
        //             privacy.delete_access_override(data.value);
        //             this.update_webview(panel);
        //             break;
		// 		}
		// 		case "selectOverride": {
        //             privacy.set_access_override(data.value[0], Number(data.value[1]));
        //             // this.update_webview(panel);
        //             break;
		// 		}
		// 	}
		// });
        // panel.webview.postMessage({ command: "rules", value: this.rules });
        // this.update_webview(panel);
    }

    public dispose() {
        ChatTab.currentPanel = undefined;

        ChatTab._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    // static update_webview(panel: vscode.WebviewPanel) {
    //     console.log('--------------------------> update webview');
    //     if(!panel) {
    //         return false;
    //     }
    //     let accessDefaults = privacy.get_global_access();
    //     accessDefaults.then((defaults) => {
    //         panel.webview.postMessage({ command: "defaults", value: defaults });
    //     });
    //     let accessOverrides = privacy.get_access_overrides();
    //     accessOverrides.then((overrides) => {
    //         panel.webview.postMessage({ command: "overrides", value: overrides });
    //     });
    // }

    static getHtmlForWebview(webview: vscode.Webview, extensionUri: any, cnt: any): string {
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

                <title>Your Privacy Rules</title>
                <link href="${styleMainUri}" rel="stylesheet">
            </head>
            <body>
                <h1 class="codify-privacy__title">Codify Chat</h1>
                
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    static getNonce() {
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
