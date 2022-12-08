/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';


const debug_this_file = false;


async function _countdown(key: string, start: number)
{
    let context_: vscode.ExtensionContext | undefined = global.global_context;
    if (context_ === undefined) {
        return false;
    }
    let context = context_ as vscode.ExtensionContext;
    let countdown_ = await context.globalState.get<string>(key);
    let countdown: number;
    if (countdown_ === undefined) {
        countdown = start;
    } else {
        countdown = parseInt(countdown_);
    }
    if (countdown > 0 || debug_this_file) {
        countdown -= 1;
        if (countdown < 0 && debug_this_file) {
            countdown = start;
        }
        console.log(["countdown", countdown]);
        await context.globalState.update(key, countdown);
        if (countdown === 0) {
            return true;
        }
    }
    return false;
}


const hint1_key = "codify.countdownHint1";


export async function hint_after_successful_completion()
{
    let fire = await _countdown(hint1_key, 5);
    if (fire) {
        await show_hint1();
    }
}


async function show_hint1()
{
    const header =
        "Select & Refactor: select a few lines of code, press F1 and tell the model how to change it. " +
        "Good examples:  " +
        "convert to list comprehension,  " +
        "translate to python,  " +
        "use numpy.";
    const options: vscode.MessageOptions = {
        modal: false,
        detail: "Hello world",
    };
    await vscode.window.showInformationMessage(header, options, "OK").then(hint_button_clicked);
    // , "No more hints!"
}


async function hint_button_clicked(selection: string | undefined)
{
    let context_: vscode.ExtensionContext | undefined = global.global_context;
    if (context_ === undefined) {
        return;
    }
    let context = context_ as vscode.ExtensionContext;
    if (selection === "OK") {
        console.log("OK");
    // } else if (selection === "No more hints!") {
    }
}
