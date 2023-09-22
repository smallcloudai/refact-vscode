/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";


export function filename_from_document(document: vscode.TextDocument): string {
  let file_name = document.fileName;
  let project_dir = vscode.workspace.getWorkspaceFolder(document.uri)?.uri
    .fsPath;
  if (project_dir !== undefined && file_name.startsWith(project_dir)) {
    // This prevents unnecessary user name and directory details from leaking
    let relative_file_name = file_name.substring(project_dir.length);
    if (relative_file_name.startsWith("/")) {
      relative_file_name = relative_file_name.substring(1);
    }
    return relative_file_name;
  }
  // As a fallback, return the full file name without any directory
  let last_slash = file_name.lastIndexOf("/");
  if (last_slash >= 0) {
    return file_name.substring(last_slash + 1);
  }
  return file_name;
}
