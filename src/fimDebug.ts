import * as vscode from "vscode";

import * as Events from "refact-chat-js/dist/events"

// Note: this construct seems to be repetitive

function isEvent(e: unknown): e is MessageEvent {
	return e instanceof MessageEvent;
}

export class FimDebug {
	private _disposables: vscode.Disposable[] = [];
	public constructor(
		public web_panel: vscode.WebviewPanel | vscode.WebviewView
	) {
		this.dispose = this.dispose.bind(this);
		this.handleEvents = this.handleEvents.bind(this);
		this.web_panel.webview.onDidReceiveMessage(this.handleEvents, this, this._disposables);
	}

    sendFIMData(data: Events.FimDebugData) {
        const event: Events.ReceiveFIMDebugData = {
            type: Events.FIM_EVENT_NAMES.DATA_RECEIVE,
            payload: data
        };

        this.web_panel.webview.postMessage(event);
    }

    sendFIMError(message: string) {
        const event: Events.ReceiveFIMDebugError = {
            type: Events.FIM_EVENT_NAMES.DATA_ERROR,
            payload: {message: message},
        };

        this.web_panel.webview.postMessage(event);
    }

	handleEvents(e: unknown) {
        if(!isEvent(e)) { return; }

        if(Events.isReadyMessageFromFIMDebug(e.data)) {
            // handle ready message
            return;
        }

        if(Events.isRequestFIMData(e.data)) {
            // check a cache and send the data
            return;
        }

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