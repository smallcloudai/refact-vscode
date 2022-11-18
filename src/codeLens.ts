/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as estate from "./estate";


class ExperimentalLens extends vscode.CodeLens {
    public constructor(
        range: vscode.Range,
        msg: string,
        arg0: string,
    ) {
        if (arg0.length > 0) {
            super(range, {
                title: msg,
                command: 'plugin-vscode.codeLensClicked',
                arguments: [arg0]
            });
        } else {
            super(range, {
                title: msg,
                command: ''
            });
        }
    }
}


export class LensProvider implements vscode.CodeLensProvider
{
    public notifyCodeLensesChanged: vscode.EventEmitter<void>;
    public onDidChangeCodeLenses?: vscode.Event<void>;

    constructor()
    {
        this.notifyCodeLensesChanged = new vscode.EventEmitter<void>();
        this.onDidChangeCodeLenses = this.notifyCodeLensesChanged.event;
    }

    async provideCodeLenses(
        document: vscode.TextDocument,
    ): Promise<vscode.CodeLens[]>
    {
        let state = estate.state_of_document(document);
        if (!state) {
            return [];
        }
        let lenses: vscode.CodeLens[] = [];
        if (state.code_lens_pos < document.lineCount) {
            let range = new vscode.Range(state.code_lens_pos, 0, state.code_lens_pos, 0);
            lenses.push(new ExperimentalLens(range, "👍 Approve (Tab)", "APPROVE"));
            lenses.push(new ExperimentalLens(range, "👎 Reject (Esc)", "REJECT"));
            lenses.push(new ExperimentalLens(range, "↻ Rerun \"" + estate.global_intent + "\" (F1)", "RERUN"));  // 🔃
            // lenses.push(new ExperimentalLens(range, "🐶 Teach", "TEACH"));
        }
        return lenses;
    }
}


export var global_provider: LensProvider | null = null;


export function save_provider(provider: LensProvider)
{
    global_provider = provider;
}


export function quick_refresh()
{
    if (global_provider) {
        global_provider.notifyCodeLensesChanged.fire();
    }
}
