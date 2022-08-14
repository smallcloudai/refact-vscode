import {
    CodeLensProvider,
    TextDocument,
    CodeLens,
    Range,
    Command
  } from "vscode";

class LensProvider implements CodeLensProvider {
    async provideCodeLenses(document: TextDocument): Promise<CodeLens[]> {
        let topOfDocument = new Range(0, 0, 0, 0);
        let c: Command = {
          command: 'extension.addConsoleLog',
          title: 'Insert console.log',
        };   
        let codeLens = new CodeLens(topOfDocument, c);   
        return [codeLens];
      }
  }
  
  export default LensProvider; 