/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import { PrivacySettings } from './privacySettings';

export async function init() {
    let status:number|undefined = await get_global_access();
    if(status) {
        global.global_access = status;
        console.log('init global access', global.global_access);
    }
}
export async function get_global_access() {
    let global_context: vscode.ExtensionContext|undefined = global.global_context;
    if (global_context !== undefined) {
        let access: number|undefined = await global_context.globalState.get('global_access');
        if (access === undefined) {
            await global_context.globalState.update('global_access', 2);
            return 2;
        }
        return access;
    }
}

export async function set_global_access(globalDefault: number) {
    let global_context: vscode.ExtensionContext|undefined = global.global_context;
    if (global_context !== undefined) {
        await global_context.globalState.update('global_access', globalDefault);
        console.log('Global Access set to:', globalDefault);
        PrivacySettings.update_webview(PrivacySettings._panel);
    }
}

export async function set_access_override(uri: string, mode: number) {
    // console.log('Codify only',);
    let global_context: vscode.ExtensionContext|undefined = global.global_context;
    if (global_context !== undefined) {
        let data:any = {};
        let storage: any|{} = await global_context.globalState.get('codifyAccessOverrides');
        if(storage === undefined) {
            data[uri] = mode;
            await global_context.globalState.update('codifyAccessOverrides', data);
            console.log('Setting access override:', uri, mode);
            PrivacySettings.update_webview(PrivacySettings._panel);
        }
        else {
            if(storage && typeof storage === 'object') {
                data = {
                    ...storage,
                    [uri]: mode
                };
                await global_context.globalState.update('codifyAccessOverrides', data);
                console.log('Setting access override:', uri, mode);
                // status_bar.set_access_level();
                PrivacySettings.update_webview(PrivacySettings._panel);
            }
            // else {
            //     data[uri] = mode;
            //     await global_context.globalState.update('codifyAccessOverrides', data);
            // }
        }
    }
}

export async function delete_access_override(uri: string) {
    let global_context: vscode.ExtensionContext|undefined = global.global_context;
    if (global_context !== undefined) {
        let data:any = {};
        let storage: any|{} = await global_context.globalState.get('codifyAccessOverrides');
        if(storage !== undefined && typeof storage === 'object') {
            delete storage[uri]; 
            console.log('Override setting deleted:', uri);
            PrivacySettings.update_webview(PrivacySettings._panel);
        }
    }
}

export async function get_access_overrides() {
    let global_context: vscode.ExtensionContext|undefined = global.global_context;
    if (global_context !== undefined) {
        let storage = await global_context.globalState.get('codifyAccessOverrides');
        if(storage === undefined) {
            return [];
        }
        return storage;
    }
}

export function get_file_access(uri: string) {
    // return 1;
    let global_context: vscode.ExtensionContext|undefined = global.global_context;
    if (global_context !== undefined) {
        let storage: any|{} = global_context.globalState.get('codifyAccessOverrides');
        if(storage === undefined) {
            return global.global_access;
        }
        else {
            if(storage && typeof storage === 'object') {
                if(storage[uri] === undefined) {
                    let segments = uri.split('/');
                    // console.log('segments', segments);
                    for(let i = 0; i < segments.length; i++) {
                        console.log('here 1');
                        segments.pop();
                        let temp = segments.join('/');
                        console.log('temp ' + i, temp);
                        if(temp !== undefined) {
                            console.log('here 2');
                            if(storage[temp] !== undefined) {
                                console.log('here 3');
                                return storage[temp];
                            }
                            else {
                                console.log('here 4');
                                if(i === segments.length) {
                                    console.log('here 5',global.global_access);
                                    return global.global_access;
                                }
                            }

                        }
                        else {
                            console.log('here 6');
                            return global.global_access;
                        }
                    }
                }
                else {
                    console.log('here 0');
                    return storage[uri];
                }
            }
        }
    }
}