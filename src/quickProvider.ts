/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as sidebar from "./sidebar";
import * as fetchAPI from "./fetchAPI";
import {
	type ChatMessages,
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
                            line: range.start.line,
                            end: range.end.line,
                            line_text: document.lineAt(range.start.line).text.trim(),
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
                            prompt: action.prompt,
                        }
                    ],
                };
            }
            quickActions.push(quickAction);
        }

        return quickActions;
    }

    private static async loadChat(editor: vscode.TextEditor, diagnostics: any) {
        // let chat = await sidebar.open_chat_tab(
        //     "",
        //     editor,
        //     true,
        //     "",
        //     [],
        //     "",
        //     true,
        // );
        // chat will be undefined if side_panel._view is undefined
        // if (!chat) {
        //     return;
        // }
        const query_text = `@file ${editor.document.uri.path}:${diagnostics.line}\nUse patch() to fix the following problem:\n\`\`\`\n${diagnostics.message}\n\`\`\`\n at line \n\`\`\`\n${diagnostics.line_text}\n\`\`\`\n then tell if the generated patch is good in one sentence:`;
        let tools = await fetchAPI.get_tools();
        const questionData = {
            id: '',
            model: "", // FIX: should be last model used ?
            title: "Fix " + diagnostics.message,
            messages: [
                {role: "user", content: query_text}
            ] as ChatMessages,
            attach_file: false,
            tools: tools,
        };
            
        // await chat.handleChatQuestion(questionData).then(() => {
        //     console.log("Chat question handled successfully.");
        // }).catch((error) => {
        //     console.error("Error handling chat question:", error);
        // });

        global.side_panel?.goto_chat(questionData);
    }

    private static async loadChatSelection(editor: vscode.TextEditor, diagnostics: any, selected_text: string, action: string) {
        // let chat = await sidebar.open_chat_tab(
        //     "",
        //     editor,
        //     true,
        //     "",
        //     [],
        //     "",
        //     true,
        // );
        // chat will be undefined if side_panel._view is undefined
        // if (!chat) {
        //     return;
        // }

        let query_text = `@file ${editor.document.uri.path}:${diagnostics.line}\nUse patch() to ${diagnostics.prompt}:\n\`\`\`\n${selected_text}\n\`\`\`\n then tell if the generated patch is good in one sentence:\n`;
        if(action === 'explain' || action === 'summarize') {
            query_text = `@file ${editor.document.uri.path}:${diagnostics.line}\n${diagnostics.prompt}: \n\n\`\`\`\n${selected_text}\n\`\`\``;
        }
        let tools = await fetchAPI.get_tools();
        const questionData = {
            id: '',
            model: "", // FIX: should be last model used ?
            title: action.charAt(0).toUpperCase() + ' ' + action.slice(1) + selected_text,
            messages: [{role: "user", content: query_text}] as ChatMessages,
            attach_file: false,
            tools: tools,
        };

        // await chat.handleChatQuestion(questionData).then(() => {
        //     console.log("Chat question handled successfully.");
        // }).catch((error) => {
        //     console.error("Error handling chat question:", error);
        // });

        global.side_panel?.goto_chat(questionData);
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
                this.loadChatSelection(editor, diagnostics, selected_text, actionId);
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
          id: 'bugs',
          title: 'Refact.ai: Find and fix bugs',
          kind: vscode.CodeActionKind.RefactorRewrite,
          prompt: "find and fix bugs in selected code",
        },
        {
          id: 'comment',
          title: 'Refact.ai: Comment each line',
          kind: vscode.CodeActionKind.RefactorRewrite,
          prompt: "comment each line using correct language syntax",
        },
        {
          id: 'explain',
          title: 'Refact.ai: Explain code',
          kind: vscode.CodeActionKind.Refactor,
          prompt: "short explanation of selected code",
        },
        {
          id: 'improve',
          title: 'Refact.ai: Rewrite code to improve it',
          kind: vscode.CodeActionKind.RefactorRewrite,
          prompt: "rewrite selected code to more efficient and imporove it",
        },
        {
          id: 'naming',
          title: 'Refact.ai: Improve variable names',
          kind: vscode.CodeActionKind.RefactorRewrite,
          prompt: "improve variable names using correct naming convention for this language",
        },
        {
          id:'shorter',
          title: 'Refact.ai: Make code shorter',
          kind: vscode.CodeActionKind.RefactorRewrite,
          prompt: "make selected code shorter and readable",
        },
        {
          id:'summarize',
          title: 'Refact.ai: Summarize code in 1 paragraph',
          kind: vscode.CodeActionKind.Refactor,
          prompt: "summarize selected code in 1 paragraph",
        },
        {
          id: 'typehints',
          title: 'Refact.ai: Add type hints',
          kind: vscode.CodeActionKind.RefactorRewrite,
          prompt: "add type hints to selected code if it's allowed in this language",
        },
        {
          id: 'typos',
          title: 'Refact.ai: Fix typos',
          kind: vscode.CodeActionKind.RefactorRewrite,
          prompt: "fix typos in selected code",
        },
    ];

    dispose() {
        console.log("console dispose");
        // this.remove_click_handlers_for_commands();
        // // this.thread.dispose();
        // this.comment_controller.dispose();
    }
}