
/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import { basename } from "path";
import {
    EVENT_NAMES_TO_STATISTIC,
  } from "refact-chat-js/dist/events";
import * as fetchAPI from "./fetchAPI";
export class StatisticTab {
    public constructor(
        public web_panel: vscode.WebviewPanel | vscode.WebviewView,
    ) {
        this.handleEvents = this.handleEvents.bind(this);
        this.web_panel.webview.onDidReceiveMessage(this.handleEvents);
    }

    private handleEvents(message: any) {
        switch (message.type) {
            case EVENT_NAMES_TO_STATISTIC.RECEIVE_STATISTIC_DATA: {
                return fetchAPI
                    .get_statistic_data()
                    .then((data) => {
                        return this.web_panel.webview.postMessage({
                            type: EVENT_NAMES_TO_STATISTIC.RECEIVE_STATISTIC_DATA,
                            payload: data,
                        });
                    })
                    .catch((err) => {
                        return this.web_panel.webview.postMessage({
                            type: EVENT_NAMES_TO_STATISTIC.RECEIVE_STATISTIC_DATA_ERROR,
                            payload: {
                                message: err,
                              },
                        });
                    });
            }
            case EVENT_NAMES_TO_STATISTIC.RECEIVE_STATISTIC_DATA_ERROR: {
                console.error("Error fetching statistic data:", message.payload.message);
                break;
            }
        }
    }

    public get_html_for_statistics(
        webview: vscode.Webview,
        extensionUri: any,
        isTab = false
    ): string {
        const nonce = StatisticTab.getNonce();
    
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "node_modules", "refact-chat-js", "dist", "chat", "index.umd.cjs")
        );

        const styleMainUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "node_modules", "refact-chat-js", "dist", "chat", "style.css")
        );

        const styleOverride = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "assets", "custom-theme.css")
        );

        return `<!DOCTYPE html>
            <html lang="en" class="light">
            <head>
                <meta charset="UTF-8">
                <!--
                    Use a content security policy to only allow loading images from https or from our extension directory,
                    and only allow scripts that have a specific nonce.
                    TODO: remove  unsafe-inline if posable
                -->
                <meta http-equiv="Content-Security-Policy" script-src 'nonce-${nonce}'; style-src-attr 'sha256-tQhKwS01F0Bsw/EwspVgMAqfidY8gpn/+DKLIxQ65hg=' 'unsafe-hashes';">
                <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1">

                <title>Refact.ai Chat</title>
                <link href="${styleMainUri}" rel="stylesheet">
                <link href="${styleOverride}" rel="stylesheet">
            </head>
            <body>
                <div id="refact-statistic"></div>
                <script nonce="${nonce}" src="${scriptUri}"></script>

                <script nonce="${nonce}">
                window.onload = function() {
                    const root = document.getElementById("refact-statistic")
                    RefactChat.renderStatistic(root, {host: "vscode", tabbed: ${isTab}})
                }
                </script>
            </body>
            </html>`;
    }

    static getNonce()
    {
        let text = "";
        const possible =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}

