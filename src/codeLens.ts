/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as estate from "./estate";
import * as fetchH2 from 'fetch-h2';
import * as fetchAPI from "./fetchAPI";


class ExperimentalLens extends vscode.CodeLens {
    public constructor(
        range: vscode.Range,
        msg: string,
        arg0: string,
        arg1: string | null,
    ) {
        super(range, {
            title: msg,
            command: 'refactaicmd.codeLensClicked',
            arguments: [arg0, arg1]
        });
    }
}


export class LensProvider implements vscode.CodeLensProvider
{
    public notifyCodeLensesChanged: vscode.EventEmitter<void>;
    public onDidChangeCodeLenses?: vscode.Event<void>;
    public nextPinMessage: string | null = null;
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

        let customization = await fetchAPI.get_prompt_customization();

        const url = fetchAPI.rust_url("/v1/code-lens");
        const request = new fetchH2.Request(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ uri: document.uri.toString() }),
        });

        const response = await fetchH2.fetch(request);
        let lenses: vscode.CodeLens[] = [];
        if (response.status !== 200) {
            console.log([`${url} http status`, response.status]);
        } else if ("code_lens" in customization) {
            const custom_code_lens = customization["code_lens"] as { [key: string]: any };
            const this_file_lens = await response.json();
            if ("detail" in this_file_lens) {
                console.log(["/v1/code-lens error", this_file_lens["detail"]]);
            }
            if ("code_lens" in this_file_lens) {
                for (let item of this_file_lens["code_lens"]) {
                    let range = new vscode.Range(item["line1"] - 1, 0, item["line2"] - 1, 0);
                    for (const [key, lensdict] of Object.entries(custom_code_lens)) {
                        lenses.push(new ExperimentalLens(range, lensdict["label"], `"CUSTOMLENS:${key}`, item["spath"]));
                    }
                }
            }
        }

        if (state.diff_lens_pos < document.lineCount) {
            let range = new vscode.Range(state.diff_lens_pos, 0, state.diff_lens_pos, 0);
            lenses.push(new ExperimentalLens(range, "👍 Approve (Tab)", "APPROVE", ""));
            lenses.push(new ExperimentalLens(range, "👎 Reject (Esc)", "REJECT", ""));
            if(this.nextPinMessage) {
                lenses.push(new ExperimentalLens(range, "👍 Approve and Continue", "APPROVE_AND_CONTINUE", this.nextPinMessage));
            }
            // lenses.push(new ExperimentalLens(range, "↻ Rerun \"" + estate.global_intent + "\" (F1)", "RERUN"));  // 🔃
        }

        state.completion_reset_on_cursor_movement = false;
        return lenses;
    }
}


export var global_provider: LensProvider | null = null;


export function save_provider(provider: LensProvider)
{
    global_provider = provider;
}

export function set_next_ticket(msg: string | null) {
    if(global_provider) {
        global_provider.nextPinMessage = msg;
    }
}

export function quick_refresh()
{
    if (global_provider) {
        global_provider.notifyCodeLensesChanged.fire();
    }
}
