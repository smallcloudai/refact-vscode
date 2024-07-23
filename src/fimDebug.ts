// TODO: delete this file

import * as vscode from "vscode";

import {fim, type FimDebugData} from "refact-chat-js/dist/events";

export const VIEW_TYPE = "fim-debug";

function isEvent(e: unknown): e is MessageEvent {
    if(!e) { return false; }
    if(typeof e!== "object") { return false; }
    if(!("data" in e)) { return false; }
    return true;
}

export function isFIMView(view: unknown): view is FimDebug {
    if(!view) { return false; }
    if(typeof view!== "object") { return false; }
    if(!("viewType" in view)) { return false; }
    return view.viewType === VIEW_TYPE;
}

// Note: this construct seems to be repetitive

export class FimDebug {
	private _disposables: vscode.Disposable[] = [];
	public constructor(
		public web_panel: vscode.WebviewPanel | vscode.WebviewView
	) {
		this.dispose = this.dispose.bind(this);
		this.handleEvents = this.handleEvents.bind(this);
        this.sendFIMData = this.sendFIMData.bind(this);
        this.sendFIMError = this.sendFIMError.bind(this);
        this.handleReadyMessage = this.handleReadyMessage.bind(this);
		this.web_panel.webview.onDidReceiveMessage(this.handleEvents, this, this._disposables);
	}

    readonly viewType = VIEW_TYPE;

    handleReadyMessage() {
        if(global.fim_data_cache) {
            this.sendFIMData(global.fim_data_cache);
        } else {
            const error = "No FIM data found, please make a completion";
            this.sendFIMError(error);
        }
    }

    sendFIMData(data: FimDebugData) {
        const event = fim.receive(data);
        // const event: Events.ReceiveFIMDebugData = {
        //     type: Events.FIM_EVENT_NAMES.DATA_RECEIVE,
        //     payload: data
        // };

        this.web_panel.webview.postMessage(event);
    }

    sendFIMError(message: string) {
        const event = fim.error(message);
        // const event: Events.ReceiveFIMDebugError = {
        //     type: Events.FIM_EVENT_NAMES.DATA_ERROR,
        //     payload: {message: message},
        // };

        this.web_panel.webview.postMessage(event);
    }

	handleEvents(e: unknown) {
        console.log("FIM event", e);
        if(!e || typeof e !== "object") { return; }
        if(!("type" in e)) { return; }
        if(e.type === fim.ready.type) {
            return this.handleReadyMessage();
        }
        if(e.type === fim.request.type) {
            if(global.fim_data_cache) {
                return this.sendFIMData(global.fim_data_cache);
            } else {
                return this.sendFIMError("No FIM data found, please make a completion");
            }
        }
        // if(!Events.isFIMAction(e)) {
        //     return;
        // }

        // if(Events.isReadyMessageFromFIMDebug(e)) {
        //     return this.handleReadyMessage();
        // }

        // if(Events.isRequestFIMData(e)) {
        //     if(global.fim_data_cache) {
        //         return this.sendFIMData(global.fim_data_cache);
        //     } else {
        //         return this.sendFIMError("No FIM data found, please make a completion");
        //     }
        // }

	}

	dispose() {
		this._disposables.forEach((d) => d.dispose());
	}

	get_html(
		webview: vscode.Webview,
		extensionUri: any,
		isTab = false
	): string {
        const nonce = this.getNonce();
        const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(
				extensionUri,
				"node_modules",
				"refact-chat-js",
				"dist",
				"chat",
				"index.umd.cjs"
			)
		);

		const styleMainUri = webview.asWebviewUri(
			vscode.Uri.joinPath(
				extensionUri,
				"node_modules",
				"refact-chat-js",
				"dist",
				"chat",
				"style.css"
			)
		);

		const styleOverride = webview.asWebviewUri(
			vscode.Uri.joinPath(extensionUri, "assets", "custom-theme.css")
		);

        const fontSize =
            vscode.workspace
                .getConfiguration()
                .get<number>("editor.fontSize") ?? 12;
		const scaling = fontSize < 14 ? "90%" : "100%";

		return `<!DOCTYPE html>
            <html lang="en" class="light">
            <head>
                <meta charset="UTF-8">
                <title>Refact.ai F.I.M Debug</title>
                <link href="${styleMainUri}" rel="stylesheet">
                <link href="${styleOverride}" rel="stylesheet">
            </head>
            <body>
                <div id="refact-fim-debug"></div>
                <script nonce="${nonce}" src="${scriptUri}"></script>

                <script nonce="${nonce}">
                    window.onload = function() {
                        const root = document.getElementById("refact-fim-debug");
                        RefactChat.renderFIMDebug(root, {
                            host: "vscode",
                            // tabbed: ${isTab},
                            themeProps: {
                                accentColor: "gray",
                                scaling: "${scaling}",
                            },
                        });
                    };
                </script>
            </body>
            </html>`;
	}

	getNonce() {
		let text = "";
		const possible =
			"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(
				Math.floor(Math.random() * possible.length)
			);
		}
		return text;
	}
}