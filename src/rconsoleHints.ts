/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';

export let commands_available: { [key: string]: string } = {
"mcs": "Make Code Shorter",
"fix": "Find and fix bugs",
"comment": "Comment each line",
"typehints": "Add type hints",
"naming": "Improve variable names",
"explain": "Explain code",
};


function similarity_score(a: string, b: string): number {
    let score = 0;
    let digrams1 = get_digrams(a);
    let digrams2 = get_digrams(b);
    let chars1 = get_chars(a);
    let chars2 = get_chars(b);
    digrams1 = new Set([...digrams1, ...chars1]);
    digrams2 = new Set([...digrams2, ...chars2]);
    let intersection = new Set([...digrams1].filter(x => digrams2.has(x)));
    let union = new Set([...digrams1, ...digrams2]);
    score = intersection.size / union.size;
    return score;
}

function get_digrams(str: string): Set<string>
{
    let digrams = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
        let digram = str.substring(i, i + 2);
        digrams.add(digram);
    }
    return digrams;
}

function get_chars(str: string): Set<string>
{
    let chars = new Set<string>();
    for (let i = 0; i < str.length; i++) {
        let char = str.substring(i, i + 1);
        chars.add(char);
    }
    return chars;
}

// function similarity_score(a: string, b: string): number {
// {
//     let score = 0;
//     let bag1 = new Set(a.split(" "));
//     let bag2 = new Set(b.split(" "));
//     let intersection = new Set([...bag1].filter(x => bag2.has(x)));
//     let union = new Set([...bag1, ...bag2]);
//     score = intersection.size / union.size;
//     return score;
// }

export function get_hints(
    msgs: [string, string][],
    unfinished_text: string,
    selected_range: vscode.Range
): [string, string] {
    if (unfinished_text.startsWith("/")) {
        let cmd_score: { [key: string]: number } = {};
        for (let cmd in commands_available) {
            let text = commands_available[cmd] || "";
            let score = similarity_score(unfinished_text, "/" + cmd + " " + text);
            cmd_score[cmd] = score;
        }
        let sorted_cmd_score = Object.entries(cmd_score).sort((a, b) => b[1] - a[1]);
        let top3 = sorted_cmd_score.slice(0, 3);
        let result = "";
        for (let i = 0; i < top3.length; i++) {
            let cmd = top3[i][0];
            let text = commands_available[cmd] || "";
            result += `<a href=\"x\"><b>/${cmd}</b> ${text}</a><br>\n`;
        }
        return [result, "Command hints"];
    } else {
        if (!selected_range.isEmpty) {
            let lines_n = selected_range.end.line - selected_range.start.line + 1;
            return [`How to change these ${lines_n} lines? Also try "explain this" or commands starting with \"/\".`, "🪄 Selected text"];
        } else {
            return [`What would you like to generate? Also try commands starting with \"/\".`, "🪄 New Code"];
        }
    }
}
