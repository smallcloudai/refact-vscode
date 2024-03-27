/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as privacy from "./privacy";

type Rule = {
    value: number;
    name: string;
    short_description: string;
    long_description: string;
};

export class PrivacySettings {
    public static currentPanel: PrivacySettings | undefined;
    private _editor = vscode.window.activeTextEditor;
    public static _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    public static rules: Rule[] = [
        {
          value: 0,
          name: "Level 0",
          short_description: "Turn off",
          long_description:
            "Paranoid mode, Refact has no access to your files.",
        },
        {
          value: 1,
          name: "Level 1",
          short_description:
            "Refact uses AI models hosted at Refact cloud, or your self-hosting server.",
          long_description:
            "Data will be sent to Refact servers only. We don't collect datasets on the server side. If you use a self-hosting server, your data will be sent only to your server.",
        },
        {
          value: 2,
          name: "Level 2",
          short_description: "Refact is allowed to use any model, including 3rd party",
          long_description: "Data could be sent also to a 3rd party model.",
        },
      ];

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
            "refact-privacy-tab",
            "Refact.ai Privacy Settings",
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
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
        let inference_url = vscode.workspace.getConfiguration().get("refactai.infurl");
        panel.webview.postMessage({ command: "rules", value: this.rules });
        panel.webview.postMessage({ command: "inference_url", value: inference_url });
        this.update_webview(panel);
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
        if(!panel || !panel.webview) {
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


        const nonce = PrivacySettings.getNonce();
        const trash_icon = `$(trash)`;

        let items = '';
        const rules = PrivacySettings.rules;
        for (let i = 0; i < rules.length; i++) {
            items += `
                <div class="refactcss-privacy__item">
                    <label for="codify-access-${rules[i].value}">
                        <input type="radio" id="codify-access-${rules[i].value}" name="codify-access" class="refactcss-radio" value="${rules[i].value}">
                        ${rules[i].name}: ${rules[i].short_description}
                    </label>
                    <p class="refactcss-help-text">${rules[i].long_description}</p>
                </div>
            `;
        }
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
                <h1 class="refactcss-privacy__title">Your Privacy Rules</h1>
                <div class="refactcss-privacy__notice"></div>
                <div class="refactcss-privacy__global">
                    <h2 class="refactcss-privacy__subtitle">Global Defaults</h2>
                    <div class="refactcss-privacy__defaults">
                       ${items}
                    </div>
                    <h2 class="refactcss-privacy__subtitle">Global Permanent Rules to Override the Default</h2>
                    <div class="refactcss-privacy__overrides overrides">
                        <div class="overrides__header">
                            <div class="overrides__path">Path</div>
                            <div class="overrides__selector">Refact Access</div>
                            <div class="overrides__action"></div>
                        </div>
                        <div class="overrides__body">
                        </div>
                    </div>
                </div>
                <div class="refactcss-privacy__info">Use a context menu in the file tree panel to add a new rule.</div>
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
