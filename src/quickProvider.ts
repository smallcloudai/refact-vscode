/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as sidebar from "./sidebar";
import * as fetchAPI from "./fetchAPI";
import {
	type ChatMessages,
    type ChatMessage,
    type ToolCommand,
    isReadyMessage,
} from "refact-chat-js/dist/events";
export class QuickActionProvider implements vscode.CodeActionProvider {

    provideCodeActions(
      document: vscode.TextDocument,
      range: vscode.Range | vscode.Selection,
      context: vscode.CodeActionContext,
      token: vscode.CancellationToken
    ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
        if (range.isEmpty) {
            return;
        }
        const quickActions = [];
        for (const action of QuickActionProvider.actions) {
            const quickAction = new vscode.CodeAction(action.title, action.kind);
            if(action.id === 'fix') {
                quickAction.command = {
                    command: `refactcmd.${action.id}`,
                    title: action.title,
                    arguments: [
                        action.id,
                        {
                            line: range.start.line + 1,
                            end: range.end.line + 1,
                            message: context.diagnostics.map(diagnostic => diagnostic.message).join('\n')
                        }
                    ],
                };
            } else {
                quickAction.command = {
                    command: `refactcmd.${action.id}`,
                    title: action.title,
                    arguments: [
                        action.id,
                        {
                            line: range.start.line + 1,
                            end: range.end.line + 1,
                        }
                    ],
                };
            }
            quickActions.push(quickAction);
        }

        return quickActions;
    }

    private static async loadChat(editor: vscode.TextEditor, diagnostics: any) {
        let chat = await sidebar.open_chat_tab(
            "",
            editor,
            true,
            "",
            [],
            "",
            true,
        );
        // chat will be undefined if side_panel._view is undefined
        if (!chat) {
            return;
        }

        const query_text = `@file ${editor.document.uri.path}:${diagnostics.line}\nUse patch() to fix the following problem, then tell if the generated patch is good in one sentence:\n\n\`\`\`\n${diagnostics.message}\n\`\`\``;
        let tools = await fetchAPI.get_tools();
        const questionData = {
            id: chat.chat_id,
            model: "", // FIX: should be last model used ?
            title: diagnostics.message + " Fix",
            messages: [
                ["user", query_text] as ChatMessage,
            ] as ChatMessages,
            attach_file: false,
            tools: tools,
        };
            
        chat.handleChatQuestion(questionData).then(() => {
            console.log("Chat question handled successfully.");
        }).catch((error) => {
            console.error("Error handling chat question:", error);
        });
    }

    private static async loadChatSelection(editor: vscode.TextEditor, diagnostics: any, selected_text: string) {
        let chat = await sidebar.open_chat_tab(
            "",
            editor,
            true,
            "",
            [],
            "",
            true,
        );
        // chat will be undefined if side_panel._view is undefined
        if (!chat) {
            return;
        }

        const query_text = `@file ${editor.document.uri.path}:${diagnostics.line}\nUse patch() to rewrite following code, then tell if the generated patch is good in one sentence:\n\n\`\`\`\n${selected_text}\n\`\`\``;
        let tools = await fetchAPI.get_tools();
        const questionData = {
            id: chat.chat_id,
            model: "", // FIX: should be last model used ?
            title: selected_text + " Rewrite",
            messages: [
                ["user", query_text] as ChatMessage,
            ] as ChatMessages,
            attach_file: false,
            tools: tools,
        };
            
        chat.handleChatQuestion(questionData).then(() => {
            console.log("Chat question handled successfully.");
        }).catch((error) => {
            console.error("Error handling chat question:", error);
        });
    }
    

    public static async handleAction(actionId: string, diagnostics: any) {
        if (actionId === 'fix') {
            const editor = vscode.window.activeTextEditor;
            if (editor) {

                if (global.side_panel && !global.side_panel._view) {
                    await vscode.commands.executeCommand(sidebar.default.viewType + ".focus");
                } else if (global.side_panel && global.side_panel._view && !global.side_panel?._view?.visible) {
                    global.side_panel._view.show();
                }

                for (let i = 0; i < 10; i++) {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                    if (global.side_panel && global.side_panel._view) {
                        break;
                    }
                }
                this.loadChat(editor, diagnostics);
            }
        } else {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const selection = editor.selection;
                const selected_text = editor.document.getText(selection);
                if (global.side_panel && !global.side_panel._view) {
                    await vscode.commands.executeCommand(sidebar.default.viewType + ".focus");
                } else if (global.side_panel && global.side_panel._view && !global.side_panel?._view?.visible) {
                    global.side_panel._view.show();
                }

                for (let i = 0; i < 10; i++) {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                    if (global.side_panel && global.side_panel._view) {
                        break;
                    }
                }
                this.loadChatSelection(editor, diagnostics, selected_text);
            }
        }
    }

    public static readonly actions = [
        {
          id: 'fix',
          title: 'Refact.ai: Fix this problem',
          kind: vscode.CodeActionKind.QuickFix,
        },
        {
          id: 'rewrite',
          title: 'Refact.ai: Rewrite this',
          kind: vscode.CodeActionKind.RefactorRewrite,
        },
    ];

    dispose() {
        console.log("console dispose");
        // this.remove_click_handlers_for_commands();
        // // this.thread.dispose();
        // this.comment_controller.dispose();
    }
}