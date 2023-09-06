/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as mod_child_process from 'child_process';
import { fileURLToPath } from 'url';
import { join } from 'path';


let process: mod_child_process.ChildProcess | undefined = undefined;


export function rust_launch(assets_uri: vscode.Uri)
{
    if (process) {
        return;
    }
    console.log(["rust_launch", assets_uri]);
    let path_from_uri = fileURLToPath(assets_uri.toString());
    process = mod_child_process.spawn(
        join(path_from_uri, "code-scratchpads"),
        []
    );
    process.on('error', () => {
        console.log("error");
    });
    process.on('exit', () => {
        console.log("exit");
    });
    process.on('close', () => {
        console.log("close");
    });
    if (process.stdout) {
        process.stdout.on('data', (data: Buffer) => {
            console.log(`rust stdout: ${data}`);
        });
    }
    if (process.stderr) {
        process.stderr.on('data', (data: Buffer) => {
            console.error(`rust stderr: ${data}`);
        });
    }
}

export function rust_kill()
{
    if (process) {
        process.kill();
        process = undefined;
    }
}
