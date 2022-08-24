import * as vscode from "vscode";

export class SettingsPage {
	public static currentPanel: SettingsPage | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._panel.webview.html = this._getHtmlForWebview(
			this._panel.webview,
			extensionUri
		);
	}

	public static render(extensionUri: any) {
		const panel = vscode.window.createWebviewPanel(
			"codify-settings",
			"Codify Settings",
			vscode.ViewColumn.One,
			{
				enableScripts: true,
			}
		);
		panel.iconPath = vscode.Uri.joinPath(
			extensionUri,
			"images",
			"logo-small.png"
		);

		SettingsPage.currentPanel = new SettingsPage(panel, extensionUri);
	}

	public dispose() {
		SettingsPage.currentPanel = undefined;

		this._panel.dispose();

		while (this._disposables.length) {
			const disposable = this._disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}

	_getHtmlForWebview(webview: vscode.Webview, extensionUri: any) {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(extensionUri, "assets", "settings.js")
		);
		const styleMainUri = webview.asWebviewUri(
			vscode.Uri.joinPath(extensionUri, "assets", "settings.css")
		);
		const imagesUri = webview.asWebviewUri(
			vscode.Uri.joinPath(extensionUri, "images")
		);

		const nonce = this.getNonce();

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
                
                <title>Settings</title>
                <link href="${styleMainUri}" rel="stylesheet">
            </head>
            <body>
                <div class="container">
                    <header class="s-header">
                        <h1 class="s-header__title">
                            Settings
                        </h1>
                        <img class="s-header__logo" src="${imagesUri}/logo-full.svg" alt="Codify" />
                        <img class="s-header__logowhite" src="${imagesUri}/logo-full-white.svg" alt="Codify" />
                    </header>
                    <div class="s-body">
                        <div class="s-body__inline">
                            <label>User Key</label>
                            <input class="s-body__input" type="text" name="userKey" />
                        </div>
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
}
export default SettingsPage;
