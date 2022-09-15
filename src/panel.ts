import * as vscode from "vscode";
import * as highlight from "./highlight";
import * as estate from "./estate";
import * as interactiveDiff from "./interactiveDiff";
import { fetch } from 'fetch-h2';
import { checkAuth } from './extension';

class PanelWebview implements vscode.WebviewViewProvider {
	_view?: vscode.WebviewView;
	_history: string[] = [];

	constructor(private readonly _context: any) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		this._view = webviewView;
        
		webviewView.webview.options = {
            enableScripts: true,
            
			localResourceRoots: [this._context.extensionUri],
		};
        
		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        // const auth = checkAuth(this._context);
        // if(auth) {
        //     webviewView.webview.postMessage({ command: "alreadyLogged", value: auth});
        // }

		webviewView.webview.onDidReceiveMessage((data) => {
			switch (data.type) {
				case "presetSelected": {
					let editor = vscode.window.activeTextEditor;
					if (!editor) {
						return;
					}
					// vscode.commands.executeCommand("workbench.action.quickOpen", ">Codify: " + data.value);
					this.addHistory(data.value);
					estate.saveIntent(data.value);
                    this.presetIntent(data.value);
					break;
				}
				case "quickInput": {
					let editor = vscode.window.activeTextEditor;
					if (!editor) {
						return;
					}
					this.addHistory(data.value);
					estate.saveIntent(data.value);
                    this.presetIntent(data.value);
					break;
				}
                case "runLogin": {
                    this.runLogin(this._context);    
                    break;
                }
                case "openBug": {
                    vscode.commands.executeCommand("plugin-vscode.openBug");
                    break;
                }
				case "openSettings": {
					vscode.commands.executeCommand("plugin-vscode.openSettings");
				}
			}
		});
	}

    public async presetIntent(intent: string) {
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        let selection = editor.selection;
        let selectionEmpty = selection.isEmpty;

        if (selectionEmpty) {
            if (intent) {
                highlight.runHighlight(editor, intent);
            }
        } else {
            if (intent) {
                estate.saveIntent(intent);
                editor.selection = new vscode.Selection(selection.start, selection.start);
                interactiveDiff.queryDiff(editor, selection, "diff-selection");
            }
        }
    }

	public updateQuery(intent: string) {
		this._view!.webview.postMessage({ command: "updateQuery", value: intent });
	}

    async runLogin(context: any) {
        const url = 'https://max.smallcloud.ai/codify/apikey/' + global.userToken;
        const response = await fetch(url);
        const responseText = await response.text();
        const data = JSON.parse(responseText);
        console.log('status ======> ',response.status);
        console.log('data ======> ',responseText);
		this._view!.webview.postMessage({ command: "loggedIn", value: data });
        let store = context.globalState;
        store.update('codify_userName',data.userName);
        await vscode.workspace.getConfiguration().update('codify.apiKey', data.apiKey,vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration().update('codify.fineTune', data.fineTune,vscode.ConfigurationTarget.Global);
	}
    

	public addHistory(intent: string) {
		this._history.push(intent);
		this._view!.webview.postMessage({
			command: "updateHistory",
			value: this._history,
		});
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._context.extensionUri, "assets", "sidebar.js")
		);
		const styleMainUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._context.extensionUri, "assets", "sidebar.css")
		);

        let url = `https://codify.smallcloud.ai/login?token=${global.userToken}`;

		const nonce = this.getNonce();

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
				-->
				<!-- <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"> -->
				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<title>Presets</title>
                <link href="${styleMainUri}" rel="stylesheet">
			</head>
			<body>
                <div class="sidebar">
                    <div id="quickbar">
                        <input type="text" name="quickinput" id="quickinput" value="${estate.global_intent}">
                        <button id="quicksubmit">⏎</button>
                    </div>
                    <div id="sidebar">
                        <h3 class="presets-title">Works Well</h3>
                        <ul class="presets links-menu">
                            <li>Add type hints</li>
                            <li>Remove type hints</li>
                            <li>Convert to list comprehension</li>
                            <li>Add docstrings</li>
                            <li>Convert dict to class</li>
                            <li>Fix typos</li>
                            <li>Fix bugs</li>
                        </ul>
                        <h3 class="presets-title">Ideas</h3>
                        <ul class="presets links-menu">
                            <li>Fix unclear names</li>
                            <li>Make variables shorter</li>
                            <li>Make code shorter</li>
                            <li>Improve performance</li>
                            <li>Code cleanup</li>
                            <li>Make formatting consistent</li>
                            <li>Remove python 2 support</li>
                            <li>Convert to numpy</li>
                        </ul>
                        <h3 class="history-title">History</h3>
                        <ul class="history links-menu">
                        </ul>
                    </div>
                    <div class="sidebar-controls">
                        <div class="sidebar-logged">Logged as <span></span></div>
                        <a tabindex="-1" href="${url}" id="login">Login / Register</a>
                        <button tabindex="-1" id="settings">Settings</button>
                        <button tabindex="-1" id="logout">Logout</button>
                        <button tabindex="-1" id="bug">Bug Report</button>
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

export default PanelWebview;
