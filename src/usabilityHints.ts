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
    let countdown_ = context.globalState.get<string>(key);
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


export async function hint_after_successful_completion()
{
    return; // TODO: come up with a better hint
    let fire = await _countdown("codify.countdownHint1", 5);
    if (fire) {
        await show_hint1();
    }
    return fire;
}


async function show_hint1()
{
    const header =
        "Select & Refactor: select a few lines of code, press F1 and tell the model how to change it. " +
        "Good examples:  " +
        "convert to list comprehension,  " +
        "translate to python,  " +
        "add docstring,  " +
        "use numpy.";
    const options: vscode.MessageOptions = {
        modal: false,
        detail: "Hello world",
    };
    let selection = await vscode.window.showInformationMessage(header, options, "OK");
    // , "No more hints!"
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


export async function show_message_from_server(kind_of_message: string, msg: string)
{
    // Show a message from the server, but only once.
    let context_: vscode.ExtensionContext | undefined = global.global_context;
    if (context_ === undefined) {
        return false;
    }
    let context = context_ as vscode.ExtensionContext;
    let already_seen = context.globalState.get<string>(`codify.servermsg${kind_of_message}`);
    if (already_seen === undefined) {
        already_seen = "";
    }
    if (already_seen === msg) {
        return false;
    }
    if (msg === "") {
        return false;
    }
    await context.globalState.update(`codify.servermsg${kind_of_message}`, msg);
    let selection = await vscode.window.showInformationMessage(msg, "OK");
}
