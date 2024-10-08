import * as vscode from 'vscode';
import * as sidebar from "./sidebar";
import * as fetchAPI from "./fetchAPI";
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
    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {    
        return QuickActionProvider.actions.map(action => {
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
    }
    
    

    public static updateActions = async (toolboxCommands: Record<string, ToolboxCommand>) => {
        console.log('..........................',toolboxCommands);
        this.actions = Object.entries(toolboxCommands).map(([id, command]) => {
            if(id === 'help') { return; }
            let action;
            if(id === 'bugs') {
                action = new vscode.CodeAction('Refact.ai: ' + command.description, vscode.CodeActionKind.QuickFix);
            } else {
                action = new vscode.CodeAction('Refact.ai: ' + command.description, vscode.CodeActionKind.RefactorRewrite);
            }
            action.command = {
                command: 'refactcmd.genericAction',
                title: 'Refact.ai: ' + command.description,
                arguments: [id, command]
            };
            return action;
        }).filter((action): action is vscode.CodeAction => action !== undefined);
    
        this.actions.forEach(action => {
            if (action.command) {
                vscode.commands.registerCommand(action.command.command, (actionId: string, command: ToolboxCommand, context?: { range: vscode.Range, diagnostics: vscode.Diagnostic[] }) => {
                    QuickActionProvider.handleAction(actionId, command, context);
                });
            }
        });
    }

    public static async handleAction(actionId: string, command: ToolboxCommand, context?: { range: vscode.Range, diagnostics: vscode.Diagnostic[] }) {
        let tools = await fetchAPI.get_tools();
    
        const editor = vscode.window.activeTextEditor;
        const working_on_attach_filename = editor?.document.uri.fsPath || '';
        const selection = editor?.selection;
        const middle_line_of_selection = selection ? Math.floor((selection.start.line + selection.end.line) / 2) : 0;
        const code_snippet = selection ? editor.document.getText(selection) : '';
    
        const messages: PlainTextMessage[] = command.messages.map(({ content }) => ({
            role: 'system',
            content: content
                .replace("%ARGS%", '')
                .replace("%CURRENT_FILE_PATH_COLON_CURSOR%", '')
                .replace("%CURRENT_FILE%", working_on_attach_filename)
                .replace("%CURSOR_LINE%", (middle_line_of_selection + 1).toString())
                .replace("%CODE_SELECTION%", code_snippet)
        }));
        
        const question = context?.diagnostics[0]?.message || 'Issue';
        
        const chat: ChatThread = {
            id: '', // Set the ID to the active file's path
            title: question,
            messages: question ? [
                ...messages,
                { role: 'system', content: `Active file: ${working_on_attach_filename}` } // Optionally include the active file in messages
            ] : messages,
            model: '',
        };
        
        global.side_panel?.goto_chat(chat);        
    }
}

export const updateQuickActions = QuickActionProvider.updateActions;