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
                command: 'refactaicmd.codeLensClicked',
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
        // console.log(["see code_lens_pos", state.diff_lens_pos]);
        if (state.diff_lens_pos < document.lineCount) {
            let range = new vscode.Range(state.diff_lens_pos, 0, state.diff_lens_pos, 0);
            lenses.push(new ExperimentalLens(range, "👍 Approve (Tab)", "APPROVE"));
            lenses.push(new ExperimentalLens(range, "👎 Reject (Esc)", "REJECT"));
            lenses.push(new ExperimentalLens(range, "↻ Rerun \"" + estate.global_intent + "\" (F1)", "RERUN"));  // 🔃
            // lenses.push(new ExperimentalLens(range, "🐶 Teach", "TEACH"));
        }
        if (global.enable_longthink_completion && state.completion_lens_pos < document.lineCount) {
            let range = new vscode.Range(state.completion_lens_pos, 0, state.completion_lens_pos, 0);
            lenses.push(new ExperimentalLens(range, "👍 Accept (Tab)", "COMP_APPROVE"));
            lenses.push(new ExperimentalLens(range, "👎 Reject (Esc)", "COMP_REJECT"));
            lenses.push(new ExperimentalLens(range, "🤔 Think Longer (F1)", "COMP_THINK_LONGER"));
            // lenses.push(new ExperimentalLens(range, "↻ Retry (F1)", "COMPLETION_RETRY"));
            state.completion_reset_on_cursor_movement = true;
        } else {
            state.completion_reset_on_cursor_movement = false;
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
