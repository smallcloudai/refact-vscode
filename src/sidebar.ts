/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as estate from "./estate";
import * as userLogin from "./userLogin";
import * as dataCollectionPage from "./dataCollectionPage";
import * as dataCollection from "./dataCollection";
import * as extension from "./extension";

export class PanelWebview implements vscode.WebviewViewProvider {
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

        this.update_webview();

        vscode.commands.registerCommand('workbench.action.focusSideBar', () => {
            webviewView.webview.postMessage({ command: "focus" });
        });
    
		webviewView.webview.onDidReceiveMessage(async (data) => {            
			switch (data.type) {                
				case "presetSelected": {
					let editor = vscode.window.activeTextEditor;
					if (!editor) {
						return;
					}
                    let state = estate.state_of_editor(editor);

                    let function_name: string = "";
                    let use_longthink: boolean = false;

                    switch (data.class) {
                        case "selection-required": {
                            let selection = editor.selection;
                            let selection_empty = selection.isEmpty;
                            if (selection_empty) {
                                return; 
                            }
                            
                            switch (data.id) {
                                case "explain-code": {
                                    function_name = "explain-code";
                                    use_longthink = true;
                                    break;
                                }
                                case "fix-bug": {
                                    function_name = "fix-bug";
                                    use_longthink = true;
                                    break;
                                }
                                case 'complete-selected-code': {
                                    function_name = "complete-selected-code";
                                    use_longthink = true;
                                    break;
                                }
                            }
                            break;
                        }
                    }

                    if (state) {
                        await estate.switch_mode(state, estate.Mode.Normal);
                    }

                    await extension.follow_intent(data.value, function_name, use_longthink);
					break;
				}

                case "login": {
                    vscode.commands.executeCommand('plugin-vscode.login');
                    break;
                }
                case "logout": {
                    vscode.commands.executeCommand("plugin-vscode.logout");
                    break;
                }
                case "js2ts_goto_profile": {
                    vscode.env.openExternal(vscode.Uri.parse(`https://codify.smallcloud.ai/account?utm_source=plugin&utm_medium=vscode&utm_campaign=account`));
                    break;
                }
                case "js2ts_goto_datacollection": {
                    if (global.global_context !== undefined) {
                        dataCollectionPage.DataReviewPage.render(global.global_context);
                        dataCollection.data_collection_prepare_package_for_sidebar();
                    }
                    break;
                }
                case "js2ts_refresh_login": {
                    global.user_logged_in = "";
                    global.user_active_plan = "";
                    this.update_webview();
                    await userLogin.login();
                    break;
                }
				case "openSettings": {
					vscode.commands.executeCommand("plugin-vscode.openSettings");
				}
			}
		});
	}

    public update_webview()
    {
        if (!this._view) {
            return;
        }
        let plan_msg = global.user_active_plan;
        if (!plan_msg && global.streamlined_login_countdown > -1) {
            plan_msg = `Waiting for website login... ${global.streamlined_login_countdown}`;
        } else if (plan_msg) {
            plan_msg = "Active Plan: <b>" + plan_msg + "</b>";
        }
        this._view!.webview.postMessage({
            command: "ts2web",
            ts2web_user: global.user_logged_in,
            ts2web_plan: plan_msg,
        });
    }


    // public async presetIntent(intent: string) {
    //     let editor = vscode.window.activeTextEditor;
    //     if (!editor) {
    //         return;
    //     }
    //     let selection = editor.selection;
    //     let selectionEmpty = selection.isEmpty;

    //     if (selectionEmpty) {
    //         if (intent) {
    //             highlight.query_highlight(editor, intent);
    //         }
    //     } else {
    //         if (intent) {
    //             estate.saveIntent(intent);
    //             editor.selection = new vscode.Selection(selection.start, selection.start);
    //             interactiveDiff.query_diff(editor, selection, "diff-selection");
    //         }
    //     }
    // }

	// public updateQuery(intent: string) {
    //     if (!this._view) {
    //         return;
    //     }
	// 	this._view!.webview.postMessage({ command: "updateQuery", value: intent });
	// }

	// public addHistory(intent: string) {
    //     if (!this._view) {
    //         return;
    //     }
	// 	this._history.push(intent);
	// 	this._view!.webview.postMessage({
	// 		command: "updateHistory",
	// 		value: this._history,
	// 	});
	// }

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._context.extensionUri, "assets", "sidebar.js")
		);
		const styleMainUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._context.extensionUri, "assets", "sidebar.css")
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
				<!-- <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"> -->
				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<title>Presets</title>
                <link href="${styleMainUri}" rel="stylesheet">
			</head>
			<body>
                <div class="sidebar">
                    <div id="sidebar">
                        <h3 class="presets-title">Select & refactor: Press F1</h3>
                        <ul class="presets links-menu">
                            <li tabindex="2" class="regular">Add type hints</li>
                            <li tabindex="3" class="regular">Remove type hints</li>
                            <li tabindex="4" class="regular">Convert to list comprehension</li>
                            <li tabindex="5" class="regular">Add docstrings</li>
                        </ul>
                        <h3 class="presets-title">3rd Party</h3>
                        <ul class="presets links-menu">
                            <li tabindex="2" class="selection-required" id="explain-code">Explain Code</li>
                            <li tabindex="3" class="selection-required" id="fix-bug">Fix Bug</li>
                            <li tabindex="4" class="selection-required" id="complete-selected-code">Complete Selected Code</li>
                        </ul>
                    </div>
                    <div class="sidebar-controls">
                        <button tabindex="-1" id="datacollection">Review Data...</button>
                        <div class="sidebar-logged">Account: <b><span></span></b></div>
                        <div class="sidebar-plan"><span></span><button class="sidebar-plan-button">⟳</button></div>
                        <button tabindex="-1" id="login">Login / Register</button>
                        <button tabindex="-1" id="logout">Logout</button>
                        <button tabindex="-1" id="profile"><span>🔗</span> Your Account...</button>
                        <button tabindex="-1" id="settings">Settings</button>
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
