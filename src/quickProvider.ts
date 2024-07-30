import * as vscode from 'vscode';
import * as sidebar from "./sidebar";
import {
	type ChatMessages,
    type ChatMessage
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
                arguments: [action.id,context.diagnostics.map(diagnostic => diagnostic.message).join('\n')],
            };

            quickActions.push(quickAction);
        }

        return quickActions;
    }

    public static async handleAction(actionId: string, diagnosticMessage: string) {
        if (actionId === 'fix') {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                if (global.side_panel && !global.side_panel._view) {
                    await vscode.commands.executeCommand(sidebar.default.viewType + ".focus");
                } else if (global.side_panel && global.side_panel._view && !global.side_panel?._view?.visible) {
                    global.side_panel._view.show();
                }
                let attach_default = !!vscode.window.activeTextEditor;
                let chat = await sidebar.open_chat_tab(
                    diagnosticMessage,
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
                await new Promise(r => setTimeout(r, 200));
                const questionData = {
                    id: chat.chat_id,
                    model: "",
                    title: diagnosticMessage + " Fix",
                    messages: [
                        ["user", diagnosticMessage] as ChatMessage,
                    ] as ChatMessages,
                    attach_file: false,
                    tools: null
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
          title: 'Fix this problem',
          kind: vscode.CodeActionKind.QuickFix,
        },
        // {
        //   id: 'professional',
        //   title: 'Rewrite in professional tone',
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