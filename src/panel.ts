import * as vscode from 'vscode';
import * as highlight from "./highlight";
class PanelWebview implements vscode.WebviewViewProvider {

	public static readonly viewType = 'smallcloud.codify';

	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,

			localResourceRoots: [
				this._extensionUri
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(data => {
			switch (data.type) {
				case 'presetSelected':
					{
                        let editor = vscode.window.activeTextEditor;
                        if (!editor) {
                            return;
                        }
                        // vscode.commands.executeCommand("workbench.action.quickOpen", ">Codify: " + data.value);
                        highlight.runHighlight(editor, data.value);
						break;
					}
			}
		});
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'assets', 'main.js'));
		const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'assets', 'main.css'));

		const nonce = getNonce();

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				
				<title>Codify Presets</title>
                <link href="${styleMainUri}" rel="stylesheet">
			</head>
			<body>
				<h1>Codify Presets</h1>
                <ul class="presets">
                    <li>Fix types</li>
                    <li>Fix typos</li>
                    <li>Fix unclear names</li>
                    <li>Make variables shorter</li>
                    <li>Make code shorter</li>
                    <li>Improve performance</li>
                    <li>Code cleanup</li>
                    <li>Add docstrings</li>
                    <li>Make formatting consistent</li>
                    <li>Remove python 2 support</li>
                    <li>Convert to numpy</li>
                    <li>Convert dict to class</li>
                    <li>Convert to list comprehension</li>
                </ul>
                    <script nonce="${nonce}" src="${scriptUri}"></script>
                </body>
                </html>`;
            }
        }

export default PanelWebview;

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}