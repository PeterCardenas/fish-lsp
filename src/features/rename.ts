
//export function provideRename(response: FishProtocol.GetCodeFixesResponse | undefined, documents: LspDocuments | undefined): Array<LSP.CodeAction> {
//    if (!response?.body) {
//        return [];
//    }
//    return response.body.map((fix: FishProtocol.CodeAction) => LSP.CodeAction.create(
//        fix.description,
//        {
//            title: fix.description,
//            command: Commands.APPLY_WORKSPACE_EDIT,
//            arguments: [{ documentChanges: fix.changes.map(c => toTextDocumentEdit(c, documents)) }],
//        },
//        LSP.CodeActionKind.QuickFix,
//    ));
//}
