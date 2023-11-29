/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetchH2 from 'fetch-h2';
import * as userLogin from './userLogin';
import { join } from 'path';
import * as lspClient from 'vscode-languageclient/node';
import * as net from 'net';


const DEBUG_HTTP_PORT = 8001;
const DEBUG_LSP_PORT = 8002;


export class RustBinaryBlob
{
    public asset_path: string;
    public cmdline: string[] = [];
    public port: number = 0;
    public lsp_disposable: vscode.Disposable|undefined = undefined;
    public lsp_client: lspClient.LanguageClient|undefined = undefined;
    public lsp_socket: net.Socket|undefined = undefined;
    public lsp_client_options: lspClient.LanguageClientOptions;

    constructor(asset_path: string)
    {
        this.asset_path = asset_path;
        this.lsp_client_options = {
            documentSelector: [{ scheme: 'file', language: 'python' }],
            diagnosticCollectionName: 'RUST LSP',
            progressOnInitialization: true,
            traceOutputChannel: vscode.window.createOutputChannel('RUST LSP'),
            revealOutputChannelOn: lspClient.RevealOutputChannelOn.Info,
        };
    }

    public x_debug(): number
    {
        let xdebug: number|undefined = vscode.workspace.getConfiguration().get("refactai.xDebug");
        if (xdebug === undefined || xdebug === null) {
            return 0;
        }
        return 1;
    }

    public rust_url(): string
    {
        let xdebug = this.x_debug();
        let port = xdebug ? 8001 : this.port;
        if (!port) {
            return "";
        }
        return "http2://127.0.0.1:" + port.toString() + "/";
    }

    public attemping_to_reach(): string
    {
        let xdebug = this.x_debug();
        if (xdebug) {
            return `debug rust binary on ports ${DEBUG_HTTP_PORT} and ${DEBUG_LSP_PORT}`;
        } else {
            let addr = vscode.workspace.getConfiguration().get("refactai.addressURL");
            return `${addr}`;
        }
    }

    public async settings_changed()
    {
        let xdebug = this.x_debug();
        let api_key: string = userLogin.secret_api_key();
        let port: number;
        if (xdebug === 0) {
            port = this.port;  // keep the same port
            if (port === 0) {
                port = Math.floor(Math.random() * 10) + 9090;
            }
        } else {
            port = DEBUG_HTTP_PORT;
            console.log(`RUST debug is set, don't start the rust binary. Will attempt HTTP port ${DEBUG_HTTP_PORT}, LSP port ${DEBUG_LSP_PORT}`);
            console.log("Also, will try to read caps. If that fails, things like lists of available models will be empty.");
            this.cmdline = [];
            await this.terminate();  // terminate our own
            await this.read_caps();  // debugging rust already running, can read here
            await this.start_lsp_socket();
            return;
        }
        let url: string|undefined = vscode.workspace.getConfiguration().get("refactai.addressURL");
        if (url === undefined || url === null || url === "") {
            this.cmdline = [];
            await this.terminate();
            return;
        }
        let plugin_version = vscode.extensions.getExtension("smallcloud.codify")?.packageJSON.version;   // codify is the old name of the product, smallcloud is the company
        if (!plugin_version) {
            plugin_version = "unknown";
        }
        let new_cmdline: string[] = [
            join(this.asset_path, "refact-lsp"),
            "--address-url", url,
            "--api-key", api_key,
            "--http-port", port.toString(),
            "--lsp-stdin-stdout", "1",
            "--enduser-client-version", "refact-" + plugin_version + "/vscode-" + vscode.version,
            "--basic-telemetry"
        ];
        let cmdline_existing: string = this.cmdline.join(" ");
        let cmdline_new: string = new_cmdline.join(" ");
        if (cmdline_existing !== cmdline_new) {
            this.cmdline = new_cmdline;
            this.port = port;
            await this.launch();
        }
        global.side_panel?.update_webview();
    }

    public async launch()
    {
        await this.terminate();
        let xdebug = this.x_debug();
        if (xdebug) {
            this.start_lsp_socket();
        } else {
            this.start_lsp_stdin_stdout();
        }
    }

    public async stop_lsp()
    {
        if (this.lsp_client) {
            console.log("RUST STOP");
            try {
                let ts = Date.now();
                await this.lsp_client.stop();
                console.log(`RUST /STOP ${Date.now() - ts}ms`);
            } catch (e) {
                console.log(`RUST STOP ERROR e=${e}`);
            }
        }
        this.lsp_dispose();
    }

    public lsp_dispose()
    {
        if (this.lsp_disposable) {
            this.lsp_disposable.dispose();
            this.lsp_disposable = undefined;
        }
        this.lsp_client = undefined;
        this.lsp_socket = undefined;
    }

    public async terminate()
    {
        await this.stop_lsp();
        global.have_caps = false;
        status_bar.choose_color();
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
                return Promise.reject("read_caps bad status");
            }
            let json = await resp.json();
            console.log(["successful read_caps", json]);
            global.chat_models = Object.keys(json["code_chat_models"]);
            global.have_caps = true;
        } catch (e) {
            global.chat_models = [];
            global.have_caps = false;
            console.log(["read_caps:", e]);
        }
        status_bar.choose_color();
        global.side_panel?.update_webview();
    }

    public async start_lsp_stdin_stdout()
    {
        console.log("RUST start_lsp_stdint_stdout");
        let path = this.cmdline[0];
        let serverOptions: lspClient.ServerOptions;
        serverOptions = {
            run: {
                command: String(path),
                args: this.cmdline.slice(1),
                transport: lspClient.TransportKind.stdio,
                options: { cwd: process.cwd(), detached: false, shell: false }
            },
            debug: {
                command: String(path),
                args: this.cmdline.slice(1),
                transport: lspClient.TransportKind.stdio,
                options: { cwd: process.cwd(), detached: false, shell: false }
            }
        };
        this.lsp_client = new lspClient.LanguageClient(
            'RUST LSP',
            serverOptions,
            this.lsp_client_options
        );
        this.lsp_disposable = this.lsp_client.start();
        console.log(`RUST START`);
        try {
            await this.lsp_client.onReady();
            console.log(`RUST /START`);
        } catch (e) {
            console.log(`RUST START PROBLEM e=${e}`);
        }
        // At this point we had successful client_info and workspace_folders server to client calls,
        // therefore the LSP server is started.
        // A little doubt remains about the http port, but it's very likely there's no race.
        await this.read_caps();
    }

    public async start_lsp_socket()
    {
        console.log("RUST start_lsp_socket");
        this.lsp_socket = new net.Socket();
        this.lsp_socket.on('error', (error) => {
            console.log("RUST socket error");
            console.log(error);
            console.log("RUST /error");
            this.lsp_dispose();
        });
        this.lsp_socket.on('close', () => {
            console.log("RUST socket closed");
            this.lsp_dispose();
        });
        this.lsp_socket.on('connect', async () => {
            console.log("RUST LSP socket connected");
            this.lsp_client = new lspClient.LanguageClient(
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
                this.lsp_client_options
            );
            // client.registerProposedFeatures();
            this.lsp_disposable = this.lsp_client.start();
            console.log(`RUST DEBUG START`);
            try {
                await this.lsp_client.onReady();
                console.log(`RUST DEBUG /START`);
            } catch (e) {
                console.log(`RUST DEBUG START PROBLEM e=${e}`);
            }
        });
        this.lsp_socket.connect(DEBUG_LSP_PORT);
    }
}
