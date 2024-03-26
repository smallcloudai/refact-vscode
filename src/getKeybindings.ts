import * as vscode from 'vscode';
import path from 'path';
import JSON5 from 'json5';

const isInsiders = vscode.version.includes("insider");

const codeFolder = isInsiders ? "Code - Insiders" : "Code";
const configPaths = {
	windows: path.join(process.env.APPDATA || "", codeFolder),
	macos: path.join(process.env.HOME || "", "Library", "Application Support", codeFolder),
	linux: path.join(process.env.HOME || "", "config", codeFolder)
};


function getSystem(): keyof typeof configPaths {
    switch (process.platform) {
		case "aix": return "linux";
		case "darwin": return "macos";
        case "freebsd": return "linux";
        case "linux": return "linux";
        case "openbsd": return "linux";
		case "sunos": return "linux";
		case "win32": return "windows";
        default: return "windows";
	}
}

function getPathToConfigFile(): string {
    const system = getSystem();
    const directoryForSystem = configPaths[system];
    const configDir = process.env.VSCODE_PORTABLE ? path.join(process.env.VSCODE_PORTABLE, "user-data","User") : directoryForSystem;

    const pathToFile = path.join(configDir, "User", "keybindings.json");
    return pathToFile;

}

type Keybinding = {
    command: string;
    key: string;
};

async function getUserConfig(path: string): Promise<Keybinding[]> {
    try {
        const doc = await vscode.workspace.openTextDocument(path);
        const text = doc.getText();
        const json: Keybinding[] = JSON5.parse(text);
        return json;
    } catch (e) {
        return [];
    }
}

export async function getKeybindings(key: string): Promise<string>;

export async function getKeybindings(): Promise<Record<string, string>>;

export async function getKeybindings(key?: string): Promise<string | Record<string, string>> {
    const pathToConfigFile = getPathToConfigFile();
    const defaultKeyBindings: Keybinding[] = require("../package.json").contributes.keybindings;
    const userConfig = await getUserConfig(pathToConfigFile);


    const allKeyBindings = [...defaultKeyBindings, ...userConfig];
    const data = allKeyBindings.reduce<Record<string, string>>((a, b) => {
        a[b.command] = b.key;
        return a;
    }, {});

    if(key){
        return data[key];
    } else {
        return data;
    }
}

export async function getKeyBindingForChat(): Promise<string> {
    const system = getSystem();
    let key = await getKeybindings("refactaicmd.callChat");

    if(system === "macos") {
        key = key
			.replace("alt", "⌥")
			.replace("ctrl", "⌃")
			.replace("cmd", "⌘")
			.toLocaleUpperCase()
			.replace("+", "&hairsp;");
    }
    return key;
}