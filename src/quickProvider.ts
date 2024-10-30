import * as vscode from 'vscode';
import * as path from 'path';
import { ToolboxCommand } from "./launchRust";
import {
    setInputValue,
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

    public static sendQuickActionToChat(messageBlock: string) {
        if (!global || !global.side_panel || !global.side_panel._view) {
            return;
        }
        const message = setInputValue({
            value: messageBlock,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            send_immediately: true
        });
        global.side_panel._view.webview.postMessage(message);
    }

    public static async handleAction(actionId: string, command: ToolboxCommand, context?: { range: vscode.Range, diagnostics: vscode.Diagnostic[] }) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        const filePath = vscode.window.activeTextEditor?.document.fileName || "";
        const workspaceFolders = vscode.workspace.workspaceFolders;
        let relativePath: string = "";

        if (workspaceFolders) {
            const workspacePath = workspaceFolders[0].uri.fsPath;
            relativePath = path.relative(workspacePath, filePath);
        }

        const selection = editor.selection;
        let codeSnippet = '';
        let middleLineOfSelection = 0;
        let diagnosticMessage = '';

        // if no diagnostic were present, taking user's selection instead
        if (actionId === 'bugs' && context?.diagnostics && context.diagnostics.length > 0) {
            const diagnostic = context.diagnostics[0];
            diagnosticMessage = diagnostic.message;
            middleLineOfSelection = diagnostic.range.start.line;

            codeSnippet = editor.document.getText(diagnostic.range);
        } else {
            codeSnippet = editor.document.getText(selection);
            middleLineOfSelection = Math.floor((selection.start.line + selection.end.line) / 2);
        }

        if (!codeSnippet) {
            const cursorPosition = selection.isEmpty ? editor.selection.active : selection.start;
            const startLine = Math.max(0, cursorPosition.line - 2);
            const endLine = Math.min(editor.document.lineCount - 1, cursorPosition.line + 2);
            const range = new vscode.Range(startLine, 0, endLine, editor.document.lineAt(endLine).text.length);
            codeSnippet = editor.document.getText(range);
            middleLineOfSelection = cursorPosition.line;
        }

        const messageBlock = command.messages.map(({content}) => (
            content
                // we should fetch default prompt somehow
                .replace("%PROMPT_DEFAULT%", '')
                .replace("%CURRENT_FILE_PATH_COLON_CURSOR%", '')
                .replace("%CURRENT_FILE%", filePath)
                .replace("%CURSOR_LINE%", (middleLineOfSelection + 1).toString())
                .replace("%CODE_SELECTION%", codeSnippet + "\n")
        )).join("\n");

        vscode.commands.executeCommand("refactaicmd.callChat");
        this.sendQuickActionToChat(messageBlock);
    }
}

export const updateQuickActions = QuickActionProvider.updateActions;