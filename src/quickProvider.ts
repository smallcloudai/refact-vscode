/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as sidebar from "./sidebar";
import * as fetchAPI from "./fetchAPI";
import {
	type ChatMessages,
    type ChatMessage,
    type ToolCommand
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
            quickActions.push(quickAction);
        }

        return quickActions;
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
                // let attach_default = !!vscode.window.activeTextEditor;
                let chat = await sidebar.open_chat_tab(
                    diagnostics.message,
                    editor,
                    true,
                    "",
                    [],
                    "",
                    true,
                );
                if (!chat) {
                    return;
                }
                await new Promise(r => setTimeout(r, 250));
                const query_text = `@file ${editor.document.uri.path}:${diagnostics.line}\nUse patch() to fix the following problem, then tell if the generated patch is good in one sentence:\n\n\`\`\`\n${diagnostics.message}\n\`\`\``;
                let tools = await fetchAPI.get_tools();
                const questionData = {
                    id: chat.chat_id,
                    model: "",
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
        }
    }

    public static readonly actions = [
        {
          id: 'fix',
          title: 'Refact.ai: Fix this problem',
          kind: vscode.CodeActionKind.QuickFix,
        },
        // {
        //   id: 'fixthis',
        //   title: 'Refact.ai: Rewrite this problem',
        //   kind: vscode.CodeActionKind.RefactorRewrite,
        // },

    ];

    dispose() {
        console.log("console dispose");
        // this.remove_click_handlers_for_commands();
        // // this.thread.dispose();
        // this.comment_controller.dispose();
    }
}