import {
    CodeLensProvider,
    TextDocument,
    CodeLens,
    Range,
    Command
  } from "vscode";

class LensProvider implements CodeLensProvider {
    async provideCodeLenses(document: TextDocument): Promise<CodeLens[]> {
        let topOfDocument = new Range(10, 0, 10, 0);
        let c: Command = {
          command: 'codify.runTab',
          title: 'Accept',
        };   
        let codeLens = new CodeLens(topOfDocument, c);   
        return [codeLens];
      }
  }
  
  export default LensProvider; 