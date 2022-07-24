import {
    Position,
    TextDocument,
    TextEditor,
    Range,
    Command,
    window,
    languages,
    commands,
    DecorationOptions,
    OverviewRulerLane,
    TextEditorDecorationType,
    DiagnosticCollection,
} from "vscode";


var diagCollection: DiagnosticCollection;
var usedDecorations: TextEditorDecorationType[] = [];


export function createDiagnosticCollection()
{
    let c = languages.createDiagnosticCollection('myhl');
    diagCollection = c;
    return c;
}


export function colorTokensInRange(
    editor: TextEditor,
    range: Range,
    tokens: string[],
    topLogprobs: {[key: string]: number}[][],
) {
    const COLORS = 100;
    let heatColormap: TextEditorDecorationType[] = [];
    let heatRangeMsg: DecorationOptions[][] = [];
    for (let i = 0; i < COLORS; i++) {
        let color = `hsl(${i * 360 / COLORS / 3}, 100%, ${75 + 20 * i / COLORS}%)`;
        let dec = window.createTextEditorDecorationType({
            backgroundColor: color,
            overviewRulerColor: color,
            overviewRulerLane: OverviewRulerLane.Right,
        });
        heatColormap.push(dec);
        usedDecorations.push(dec);
        heatRangeMsg.push([]);
    }

    function printLogprob(logprob: any)
    {
        return (100*Math.exp(Number(logprob))).toFixed(1);
    }

    let linen = 0;
    let pos = 0;
    for (let t = 0; t < tokens.length; t++) {
        let token = tokens[t];
        if (linen >= range.start.line && linen <= range.end.line) {
            let top = topLogprobs[t];
            let hover = "";
            let color = 0;
            let top5 = [];
            let tokenHover;
            let entropy = 0;
            for (let key in top) {
                let logprob = top[key];
                top5.push([Number(logprob), key]);
                if (key === token) {
                    color = (Number(logprob) + 8) * COLORS / 8;
                    color = Math.min(Math.max( Math.floor(color), 0), COLORS);
                    tokenHover = `${printLogprob(logprob)} "${token}"\n\n`;
                }
                entropy -= Number(logprob) * Math.exp(Number(logprob));
            }
            top5.sort((a, b) => Number(b[0]) - Number(a[0]));
            if (top5.length > 5) {
                top5.length = 5;
            }
            let seeToken = false;
            for (let i = 0; i < top5.length; i++) {
                hover += `**${printLogprob(top5[i][0])}** "${top5[i][1]}"\n\n`;
                seeToken = seeToken || top5[i][1] === token;
            }
            if (!seeToken) {
                if (tokenHover) {
                    hover += tokenHover;
                } else {
                    hover += `"${token}" is not in top`;
                }
            }
            const rangeMsg = {
                range: new Range(linen, pos, linen, pos + token.length),
                hoverMessage: hover,
                };
            heatRangeMsg[color].push(rangeMsg);
        }
        for (var i=0; i<token.length; i++) {
            if ("\n"===token[i]) {
                linen += 1;
                pos = 0;
            } else {
                pos += 1;
            }
        }
    }
    for (let i = 0; i < COLORS; i++) {
        if (heatRangeMsg[i].length > 0) {
            editor.setDecorations(heatColormap[i], heatRangeMsg[i]);
        }
    }
}


export function decorationsCleanup()
{
    if (!window.activeTextEditor) {
        return;
    }
    diagCollection.clear();
    usedDecorations.forEach(d => d.dispose());
    usedDecorations.length = 0;
}
