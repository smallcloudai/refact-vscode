// import {
//     CodeLensProvider,
//     TextDocument,
//     CodeLens,
//     Range,
//     Command,
//     Position
//   } from "vscode";

import * as vscode from 'vscode';

class LensProvider implements vscode.CodeLensProvider {
    async provideCodeLenses(
        document: vscode.TextDocument,
    ): Promise<vscode.CodeLens[]> {
        let activeEditor = vscode.window.activeTextEditor;
        let selection = activeEditor!.selection;
        let currentLineRange = document.lineAt(selection.active.line).range;
        console.log('currentLineRange',currentLineRange);
        let c: vscode.Command = {
          command: 'plugin-vscode.highlight',
        //   title: '💡 Press F1 to start highlight',
          title: '⬆ Scroll to highlight',
        };   
        let codeLens = new vscode.CodeLens(currentLineRange, c);   
        return [codeLens];
      }
  }
  
  export default LensProvider; 