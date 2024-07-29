import * as vscode from 'vscode';
export class QuickActionProvider implements vscode.CodeActionProvider {

    provideCodeActions(
      document: vscode.TextDocument,
      range: vscode.Range | vscode.Selection,
      context: vscode.CodeActionContext,
      token: vscode.CancellationToken
    ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
        if (range.isEmpty) {
            return;
        }
        const quickActions = [];
        // prepare the code actions for the above actions
        for (const action of QuickActionProvider.actions) {
            const quickAction = new vscode.CodeAction(action.title, action.kind);
            quickAction.command = {
            command: `my-shiny-extension.${action.id}`,
            title: action.title,
            arguments: [action.id],
            };

            quickActions.push(quickAction);
        }

        return quickActions;
    }

    public static handleAction(actionId: string) {
        console.log(`handleAction for ${actionId}`);
    }

    public static readonly actions = [
        {
          id: 'rephrase',
          title: 'Rephrase selected text',
          kind: vscode.CodeActionKind.QuickFix,
        },
        {
          id: 'headlines',
          title: 'Suggest headlines',
          kind: vscode.CodeActionKind.QuickFix,
        },
        // {
        //   id: 'professional',
        //   title: 'Rewrite in professional tone',
        //   kind: vscode.CodeActionKind.RefactorRewrite,
        // },
        // {
        //   id: 'casual',
        //   title: 'Rewrite in casual tone',
        //   kind: vscode.CodeActionKind.RefactorRewrite,
        // },
    ];

    dispose() {
        console.log("console dispose");
        // this.remove_click_handlers_for_commands();
        // // this.thread.dispose();
        // this.comment_controller.dispose();
    }
}