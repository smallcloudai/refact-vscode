import * as vscode from 'vscode';

async function getPythonExec<T = any>(extension:  any): Promise<string | undefined> {
    const execDetails = await extension.exports.settings.getExecutionDetails();
    let result: string | undefined;
    if (execDetails.execCommand && execDetails.execCommand.length > 0) {
        result = execDetails.execCommand[0];
    }
    return result;
}

export async function collectEnvAndUpdateLsp() {
    let payload: { [id: string]: string; } = {}
    const python_extension = vscode.extensions.getExtension('ms-python.python');

    if (python_extension) {
        if (python_extension.packageJSON?.featureFlags?.usingNewInterpreterStorage) {
            if (!python_extension.isActive) {
                await python_extension.activate();
            }
            const python_exec_path = await getPythonExec(python_extension);
            if (python_exec_path) {
                payload["python_path"] = python_exec_path
            } 
        }
    }
    await global.rust_binary_blob?.update_env(payload);
}

export async function subscribeSettingsChanges() {
    const python_extension = vscode.extensions.getExtension('ms-python.python');
    if (python_extension) {
        if (python_extension.packageJSON?.featureFlags?.usingNewInterpreterStorage) {
            if (!python_extension.isActive) {
                await python_extension.activate();
            }
            if (python_extension.exports.settings.onDidChangeExecutionDetails) {
                python_extension.exports.settings.onDidChangeExecutionDetails(async () => {
                    await collectEnvAndUpdateLsp()
                });
            }
        }
    }
}
