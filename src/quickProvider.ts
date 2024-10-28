import * as vscode from 'vscode';
import * as sidebar from "./sidebar";
import * as fetchAPI from "./fetchAPI";
import { v4 as uuidv4 } from "uuid";
import { ToolboxCommand, ChatMessageFromLsp } from "./launchRust";
import {
    type ChatMessages,
    ChatThread,
} from "refact-chat-js/dist/events";

type PlainTextMessage = {
    role: 'system';
    content: string;
};

type ChatMessage = PlainTextMessage;

export class QuickActionProvider implements vscode.CodeActionProvider {
    private static actions: vscode.CodeAction[] = [];
    private static quickActionDisposables: vscode.Disposable[] = [];

    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix,
        vscode.CodeActionKind.RefactorRewrite
    ];

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
        // Create new instances of Refact.ai actions
        const refactActions = QuickActionProvider.actions.map(action => {
            const newAction = new vscode.CodeAction(action.title, action.kind);
            if (action.command) {
                const diagnosticRange = context.diagnostics[0]?.range || range;

                newAction.command = {
                    ...action.command,
                    arguments: [
                        action.command.arguments?.[0],
                        action.command.arguments?.[1],
                        {
                            range: diagnosticRange,
                            diagnostics: context.diagnostics
                        }
                    ]
                };
            }
            return newAction;
        });

        return refactActions;
    }

    public static updateActions = async (toolboxCommands: Record<string, ToolboxCommand>) => {
        this.actions = Object.entries(toolboxCommands).map(([id, command]) => {
            if(id === 'help') { return; }
            let action;
            if(id === 'bugs') {
                action = new vscode.CodeAction('Refact.ai: ' + command.description, vscode.CodeActionKind.QuickFix);
            } else {
                action = new vscode.CodeAction('Refact.ai: ' + command.description, vscode.CodeActionKind.RefactorRewrite);
            }
            action.command = {
                command: 'refactcmd.' + id,
                title: 'Refact.ai: ' + command.description,
                arguments: [id, command]
            };
            return action;
        }).filter((action): action is vscode.CodeAction => action !== undefined);
        
        const dispose = (disposables: vscode.Disposable[]) => {
            disposables.forEach(d => d.dispose());
        }; 

        dispose(this.quickActionDisposables);

        this.actions.forEach(action => {
            if (action.command) {
                try {
                    // XXX: this returns disposable, we need to dispose of old before setting new
                    let disposable = vscode.commands.registerCommand(
                        action.command.command,
                        (actionId: string, command: ToolboxCommand, context?: { range: vscode.Range, diagnostics: vscode.Diagnostic[] }) => {
                            QuickActionProvider.handleAction(actionId, command, context);
                        },
                    );
                    this.quickActionDisposables.push(disposable);
                } catch (e) {
                    console.error('Error registering command', e);
                }
            }
        });
    };

    public static async handleAction(actionId: string, command: ToolboxCommand, context?: { range: vscode.Range, diagnostics: vscode.Diagnostic[] }) {
        let tools = await fetchAPI.get_tools();

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        const working_on_attach_filename = editor.document.uri.fsPath;
        const selection = editor.selection;
        let code_snippet = '';
        let middle_line_of_selection = 0;
        let diagnostic_message = '';

        if (actionId === 'bugs') {
            if (context?.diagnostics && context.diagnostics.length > 0) {
                const diagnostic = context.diagnostics[0];
                diagnostic_message = diagnostic.message;
                middle_line_of_selection = diagnostic.range.start.line;

                code_snippet = editor.document.getText(diagnostic.range);
            }

            if (!code_snippet) {
                const cursorPosition = selection.isEmpty ? editor.selection.active : selection.start;
                const startLine = Math.max(0, cursorPosition.line - 2);
                const endLine = Math.min(editor.document.lineCount - 1, cursorPosition.line + 2);
                const range = new vscode.Range(startLine, 0, endLine, editor.document.lineAt(endLine).text.length);
                code_snippet = editor.document.getText(range);
                middle_line_of_selection = cursorPosition.line;
            }
        } else {
            code_snippet = editor.document.getText(selection);
            middle_line_of_selection = Math.floor((selection.start.line + selection.end.line) / 2);
        }

        const messages: PlainTextMessage[] = command.messages.map(({ content }) => ({
            role: 'system',
            content: content
                .replace("%ARGS%", '')
                .replace("%CURRENT_FILE_PATH_COLON_CURSOR%", '')
                .replace("%CURRENT_FILE%", working_on_attach_filename)
                .replace("%CURSOR_LINE%", (middle_line_of_selection + 1).toString())
                .replace("%CODE_SELECTION%", code_snippet)
        }));

        const question = actionId === 'bugs' ? (diagnostic_message || 'Issue with code') : 'Issue';

        const chat: ChatThread = {
            id: uuidv4(),
            title: question,
            messages: [
                ...messages,
                { role: 'system', content: `Active file: ${working_on_attach_filename}` },
                ...(actionId === 'bugs' && diagnostic_message
                    ? [{ role: 'user', content: `Error in: ${diagnostic_message}` }]
                    : [])
            ] as ChatMessage[],
            model: '',
        };
        vscode.commands.executeCommand("refactaicmd.callChat");
        global.side_panel?.goto_chat(chat);
    }
}

export const updateQuickActions = QuickActionProvider.updateActions;