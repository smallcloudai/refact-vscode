/* eslint-disable @typescript-eslint/naming-convention */


export function cleanup_cr_lf(
    text: string,
    cursors: number[]
): [string, number[], number[]]
{
    let text_cleaned: string = text.replace(/\r\n/g, "\n");
    let cursor_cleaned_cr: number[] = [];
    let cursor_transmit: number[] = [];
    for (let i = 0; i < cursors.length; i++) {
        let cursor = cursors[i];
        let text_left = text.substring(0, cursor);

        let text_left_cleaned = text_left.replace(/\r\n/g, "\n");
        let cleaned_cr = cursor - (text_left.length - text_left_cleaned.length);
        cursor_cleaned_cr.push(cleaned_cr);

        let replace_emoji_with_one_char = text_left_cleaned.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, " ");
        cursor_transmit.push(cleaned_cr - (text_left_cleaned.length - replace_emoji_with_one_char.length));
    }
    return [text_cleaned, cursor_cleaned_cr, cursor_transmit];
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


export function simple_cleanup_cr_lf(
    text: string
): string {
    let text_cleaned: string = text.replace(/\r\n/g, "\n");
    return text_cleaned;
}
