/* eslint-disable @typescript-eslint/naming-convention */
const Diff = require('diff');  // Documentation: https://github.com/kpdecker/jsdiff/


export function if_head_tail_equal_return_added_text(
    text_a: string,
    text_b: string,
): [boolean, string]
{
    const diff = Diff.diffLines(text_a, text_b);
    let allow_remove_spaces_once = true;
    let added_one_block = false;
    let added_text = "";
    let kill_slash_n = false;
    let failed = false;
    diff.forEach((part: any) => {
        let txt = part.value;
        if (part.removed) {
            if (!allow_remove_spaces_once) {
                failed = true;
            }
            allow_remove_spaces_once = false;
            let whitespace_only = /^\s*$/.test(txt);
            if (!whitespace_only) {
                failed = true;
            }
            if (txt.endsWith("\n")) {
                kill_slash_n = true;
            }
        }
        if (part.added) {
            if (added_one_block) {
                failed = true;
            }
            added_one_block = true;
            added_text = txt;
        }
    });
    if (failed) {
        return [false, ""];
    }
    if (kill_slash_n) {
        if (!added_text.endsWith("\n")) {
            console.log("WARNING: if_head_tail_equal_return_added_text: added_text does not end with \\n");
        }
        added_text = added_text.slice(0, -1);
    }
    return [true, added_text];
}
