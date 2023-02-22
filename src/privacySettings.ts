/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as privacy from "./privacy";
enum access_level {
    disabled = 0,
    codify_only = 1,
    third_party = 2,
};

export class PrivacySettings {
    public static currentPanel: PrivacySettings | undefined;
    private _editor = vscode.window.activeTextEditor;
    public static _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: any) {
        PrivacySettings._panel = panel;
        PrivacySettings._panel.webview.html = PrivacySettings.getHtmlForWebview(
            PrivacySettings._panel.webview,
            extensionUri,
            context
        );
    }

    public static render(context: any) {
        const panel = vscode.window.createWebviewPanel(
            "codify-privacy",
            "Codify Privacy Settings",
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

        PrivacySettings.currentPanel = new PrivacySettings(panel, context.extensionUri, context);


        panel.webview.onDidReceiveMessage((data) => {
			switch (data.type) {
				case "globalDefault": {
                    privacy.set_global_access(Number(data.value));
                    this.update_webview(panel);
                    break;
				}
				case "deleteOverride": {
                    // console.log(data);
                    privacy.delete_access_override(data.value);
                    this.update_webview(panel);
                    break;
				}
				case "selectOverride": {
                    privacy.set_access_override(data.value[0], Number(data.value[1]));
                    // this.update_webview(panel);
                    break;
				}
			}
		});

        this.update_webview(panel);

        // let accessOverrides = get_access_overrides();
        // accessOverrides.then((value) => {
        //     panel.webview.postMessage({ command: "overrides", value: value });
        // });
    }

    public dispose() {
        PrivacySettings.currentPanel = undefined;

        PrivacySettings._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    static update_webview(panel: vscode.WebviewPanel) {
        console.log('--------------------------> update webview');
        if(!panel) {
            return false;
        }
        let accessDefaults = privacy.get_global_access();
        accessDefaults.then((defaults) => {
            panel.webview.postMessage({ command: "defaults", value: defaults });
        });
        let accessOverrides = privacy.get_access_overrides();
        accessOverrides.then((overrides) => {
            panel.webview.postMessage({ command: "overrides", value: overrides });
        });
    }

    static getHtmlForWebview(webview: vscode.Webview, extensionUri: any, cnt: any): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "assets", "privacy.js")
        );
        const styleMainUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "assets", "privacy.css")
        );
        // const imagesUri = webview.asWebviewUri(
        //     vscode.Uri.joinPath(extensionUri, "images")
        // );


        const nonce = PrivacySettings.getNonce();
        const trash_icon = `$(trash)`;

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
                <h1 class="codify-privacy__title">Your Privacy Rules</h1>
                <div class="codify-privacy__global">
                    <h2 class="codify-privacy__subtitle">Global defaults:</h2>
                    <div class="codify-privacy__defaults">
                        <div class="codify-privacy__item">
                            <label for="codify-disabled">
                                <input type="radio" id="codify-disabled" name="codify-access" class="codify-radio" value="0">
                                Level 0: Turn off
                            </label>
                            <p class="codify-help-text">Paranoid mode, Codify has no access to your files.</p>
                        </div>
                        <div class="codify-privacy__item">
                            <label for="codify-only">
                                <input type="radio" id="codify-only" name="codify-access" class="codify-radio" value="1">
                               Level 1: Codify can read your files, but only uses AI models hosted at Codify
                            </label>
                            <p class="codify-help-text">Data will be sent to Codify servers only. We don't collect datasets on the server side.</p>
                        </div>
                        <div class="codify-privacy__item">
                            <label for="codify-3rd-party">
                                <input type="radio" id="codify-3rd-party" name="codify-access" class="codify-radio" value="2">
                                Level 2: Codify can use any model, including 3rd party
                                </label>
                            <p class="codify-help-text">Data could be sent also to 3rd party model.</p>
                        </div>
                    </div>
                    <h2 class="codify-privacy__subtitle">Global permanent rules to override the default:</h2>
                    <div class="codify-privacy__overrides overrides">
                        <div class="overrides__header">
                            <div class="overrides__path">Path</div>
                            <div class="overrides__selector">Codify Access</div>
                            <div class="overrides__action"></div>
                        </div>
                        <div class="overrides__body">
                        </div>
                    </div>
                </div>
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

export default PrivacySettings;
