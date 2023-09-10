/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as mod_child_process from 'child_process';
import { fileURLToPath } from 'url';
import { join } from 'path';


export class RustBinaryBlob
{
    public process: mod_child_process.ChildProcess | undefined = undefined;
    public asset_path: string;
    public cmdline: string[] = [];
    public port: number = 0;

    constructor(asset_path: string)
    {
        // fileURLToPath(assets_uri.toString());
        this.asset_path = asset_path;
    }

    public async settings_changed()
    {
        let port: number|undefined = vscode.workspace.getConfiguration().get("refactai.port");
        if (port === undefined) {
            port = this.port;
            if (port === 0) {
                port = Math.floor(Math.random() * 10) + 8090;
            }
        }
        let url: string|undefined = vscode.workspace.getConfiguration().get("refactai.addressURL");
        if (url === undefined) {
            this.terminate();
            return;
        }
        let new_cmdline: string[] = [
            join(this.asset_path, "code-scratchpads"),
            "--address-url",
            url,
            "--port",
            port.toString(),
        ];
        let cmdline_existing: string = this.cmdline.join(" ");
        let cmdline_new: string = new_cmdline.join(" ");
        if (cmdline_existing !== cmdline_new) {
            this.cmdline = new_cmdline;
            this.port = port;
            this.launch();
        }
    }

    public terminate()
    {
        if (this.process) {
            this.process.kill();
            this.process = undefined;
        }
    }

    public async launch()
    {
        this.terminate();
        console.log(["RUST LAUNCH:", this.cmdline.join(" ")]);
        this.process = mod_child_process.spawn(
            this.cmdline[0],
            this.cmdline.slice(1)
        );
        this.process.on('close', this.bad_things_happened);
        this.process.on('exit', this.bad_things_happened);
        this.process.on('error', this.bad_things_happened);
        if (this.process.stdout) {
            this.process.stdout.on('data', async (data: Buffer) => {
                let all_strings = data.toString().split("\n");
                for (let str of all_strings) {
                    if (str === "") {
                        continue;
                    }
                    if (str.startsWith("PORT_BUSY")) {
                        this.port = 0;
                        this.settings_changed();  // async function will run "later"
                    } else if (str.startsWith("URL_NOT_WORKING")) {
                        this.bad_url_not_working(str.slice("URL_NOT_WOKRING ".length));
                    } else if (str.startsWith("STARTED")) {
                        this.started_fine();
                    } else {
                        console.error(`RUST unhandled ${str}`);
                    }
                }
            });
        }
        if (this.process.stderr) {
            this.process.stderr.on('data', (data: Buffer) => {
                console.log(`stderr ${data}`);
            });
        }
    }

    public started_fine()
    {
        console.log("RUST started_fine");
    }

    public bad_url_not_working(msg: string)
    {
        console.log(["RUST bad_url_not_working", msg]);
    }

    public bad_things_happened(msg: any)
    {
        console.log(["RUST bad_things_happened", msg]);
    }
}
