/* eslint-disable @typescript-eslint/naming-convention */


export function cleanup_cr_lf(
    text: string,
    cursors: number[]
): [string, number[]]
{
    let text_cleaned: string = text.replace(/\r\n/g, "\n");
    let cursor_cleaned = cursors.map((cursor) => {
        let text_left = text.substring(0, cursor);
        let text_left_cleaned = text_left.replace(/\r\n/g, "\n");
        return cursor - (text_left.length - text_left_cleaned.length);
    });
    return [text_cleaned, cursor_cleaned];
}

export function add_back_cr_lf(
    text: string,
    cursors: number[]
): number[]
{
    for (let i = 0; i < text.length; i++) {
        if (text[i] === "\r") {
            cursors = cursors.map((cursor) => {
                if (cursor > i) {
                    return cursor + 1;
                }
                return cursor;
            });
        }
    }
    return cursors;
}
