/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as mod_child_process from 'child_process';
import * as fetchH2 from 'fetch-h2';
import * as userLogin from './userLogin';
import { join } from 'path';
import * as lspClient from 'vscode-languageclient/node';
import * as net from 'net';


export class RustBinaryBlob
{
    public process: mod_child_process.ChildProcess | undefined = undefined;
    public asset_path: string;
    public cmdline: string[] = [];
    public port: number = 0;
    public lsp_disposable: vscode.Disposable|undefined = undefined;
    public lsp_socket: net.Socket|undefined = undefined;

    constructor(asset_path: string)
    {
        this.asset_path = asset_path;
    }

    public rust_url(): string
    {
        let userport: number|undefined = vscode.workspace.getConfiguration().get("refactai.xDebugPort");
        let port_not_set = userport === undefined || userport === null;
        let port = port_not_set ? this.port : userport;
        if (!port) {
            return "";
        }
        return "http://127.0.0.1:" + port.toString() + "/";
    }

    public async settings_changed()
    {
        let userport: number|undefined = vscode.workspace.getConfiguration().get("refactai.xDebugPort");
        let api_key: string = userLogin.secret_api_key();
        let port_not_set = userport === undefined || userport === null;
        let port: number;
        if (port_not_set) {
            port = this.port;
            if (port === 0) {
                port = Math.floor(Math.random() * 10) + 8090;
            }
        } else {
            console.log("RUST debug port is set, assuming debugging session, don't start rust binary. Also, will try to read caps. If that fails, things like lists of available models will be empty.");
            this.cmdline = [];
            await this.terminate();
            await this.read_caps();
            await this.start_lsp();
            return;
        }
        let url: string|undefined = vscode.workspace.getConfiguration().get("refactai.addressURL");
        if (url === undefined || url === null || url === "") {
            this.cmdline = [];
            await this.terminate();
            return;
        }
        let new_cmdline: string[] = [
            join(this.asset_path, "code-scratchpads"),
            "--address-url", url,
            "--port", port.toString(),
            "--api-key", api_key,
            "--enduser-client-version", "refact-vscode-" + vscode.version,
            "--basic-telemetry"
        ];
        let cmdline_existing: string = this.cmdline.join(" ");
        let cmdline_new: string = new_cmdline.join(" ");
        if (cmdline_existing !== cmdline_new) {
            this.cmdline = new_cmdline;
            this.port = port;
            await this.launch();
        }
    }

    public async terminate()
    {
        this.stop_lsp();
        if (this.process) {
            console.log("RUST SIGINT");
            this.process.kill("SIGINT");
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log("RUST SIGTERM");
            this.process.kill();
            this.process = undefined;
        }
    }

    public async launch()
    {
        await this.terminate();
        this.start_lsp();
        return;
        // console.log(["RUST LAUNCH:", this.cmdline.join(" ")]);
        // this.process = mod_child_process.spawn(
        //     this.cmdline[0],
        //     this.cmdline.slice(1)
        // );
        // this.process.on('close', this.bad_things_happened);
        // this.process.on('exit', this.bad_things_happened);
        // this.process.on('error', this.bad_things_happened);
        // if (this.process.stderr) {
        //     this.process.stderr.on('data', async (data: Buffer) => {
        //         let all_strings = data.toString().split("\n");
        //         for (let str of all_strings) {
        //             if (str === "") {
        //                 continue;
        //             }
        //             if (str.startsWith("PORT_BUSY ")) {
        //                 this.port = 0;
        //                 this.settings_changed();  // async function will run "later"
        //             } else if (str.startsWith("URL_NOT_WORKING ")) {
        //                 this.bad_url_not_working(str.slice("URL_NOT_WOKRING ".length));
        //             } else if (str.startsWith("STARTED ")) {
        //                 this.started_fine();
        //             } else if (str.startsWith("CAPS")) {
        //                 await this.read_caps();
        //                 await this.start_lsp();
        //             } else {
        //                 console.log(`stderr ${data}`);
        //             }
        //         }
        //     });
        // }
    }

    public async start_lsp()
    {
        if (this.lsp_disposable) {
            return;
        }
        console.log("RUST start_lsp");

        // let path = this.cmdline[0];
        // let myserv: lspClient.Executable = {
        //     command: String(path),
        //     args: this.cmdline.slice(1),
        //     options: { cwd: process.cwd(), detached: true, shell: true }
        // };

        // let serverOptions: lspClient.ServerOptions = {
        //     run: myserv,
        //     debug: myserv
        // };

        let clientOptions: lspClient.LanguageClientOptions = {
            documentSelector: [{ scheme: 'file', language: 'python' }],
            diagnosticCollectionName: 'RUST LSP',
            progressOnInitialization: true,
            traceOutputChannel: vscode.window.createOutputChannel('RUST LSP'),
            revealOutputChannelOn: lspClient.RevealOutputChannelOn.Info,
            // middleware: {
            //     executeCommand: async (command, args, next) => {
            //         return next(command, args);
            //     }
            // }
        };

        // let client = new lspClient.LanguageClient(
        //     'Custom rust LSP server',
        //     serverOptions,
        //     clientOptions
        // );
        // client.registerProposedFeatures();
        // this.lsp_disposable = client.start();

        this.lsp_socket = new net.Socket();
        this.lsp_socket.on('error', (error) => {
            console.log("RUST socket error");
            console.log(error);
            console.log("RUST /error");
            this.stop_lsp();
        });
        this.lsp_socket.on('close', () => {
            console.log("RUST socket closed");
            this.stop_lsp();
        });
        this.lsp_socket.on('connect', () => {
            console.log("RUST LSP socket connected");
            let client: lspClient.LanguageClient;
            client = new lspClient.LanguageClient(
                'Custom rust LSP server',
                async () => {
                    if (this.lsp_socket === undefined) {
                        return Promise.reject("this.lsp_socket is undefined, that should not happen");
                    }
                    return Promise.resolve({
                        reader: this.lsp_socket,
                        writer: this.lsp_socket
                    });
                },
                clientOptions
            );
            client.registerProposedFeatures();
            this.lsp_disposable = client.start();
        });
        this.lsp_socket.connect(8002);
    }

    public stop_lsp()
    {
        console.log("RUST stop_lsp");
        if (this.lsp_disposable) {
            this.lsp_disposable.dispose();
            this.lsp_disposable = undefined;
        }
        this.lsp_socket = undefined;
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

    public async read_caps()
    {
        try {
            let url = this.rust_url();
            if (!url) {
                return Promise.reject("read_caps no rust binary working, very strange");
            }
            url += "v1/caps";
            let req = new fetchH2.Request(url, {
                method: "GET",
                redirect: "follow",
                cache: "no-cache",
                referrer: "no-referrer"
            });
            let resp = await fetchH2.fetch(req);
            if (resp.status !== 200) {
                console.log(["read_caps http status", resp.status]);
                return Promise.reject("Bad status");
            }
            let json = await resp.json();
            console.log(["successful read_caps", json]);
            global.chat_models = Object.keys(json["code_chat_models"]);
        } catch (e) {
            console.log(["read_caps:", e]);
        }
    }
}
