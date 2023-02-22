

import { DocumentSymbol, SymbolKind, Range, } from 'vscode-languageserver';
import { SyntaxNode } from 'web-tree-sitter';
import { isFunctionDefinitionName, isDefinition, isVariableDefinition, isFunctionDefinition } from './utils/node-types'
import { DocumentationStringBuilder } from './utils/symbol-documentation-builder';
import { getRange } from './utils/tree-sitter';

export interface FishDocumentSymbol extends DocumentSymbol {
    name: string;
    detail: string;
    kind: SymbolKind;
    uri: string;
    range: Range;
    selectionRange: Range;
    children: FishDocumentSymbol[];
}

export namespace FishDocumentSymbol {
    /**
     * Creates a new symbol information literal.
     *
     * @param name The name of the symbol.
     * @param detail The detail of the symbol.
     * @param kind The kind of the symbol.
     * @param uri The documentUri of the symbol.
     * @param range The range of the symbol.
     * @param selectionRange The selectionRange of the symbol.
     * @param children Children of the symbol.
     */
    export function create(name: string, detail: string, kind: SymbolKind, uri: string, range: Range, selectionRange: Range, children: FishDocumentSymbol[]): FishDocumentSymbol {
        return {
            name,
            detail,
            kind,
            uri,
            range,
            selectionRange,
            children,
        } as FishDocumentSymbol;
    }

    export function copy(symbol: FishDocumentSymbol, newChildren?: FishDocumentSymbol[]): FishDocumentSymbol {
        return {
            name: symbol.name,
            detail: symbol.detail,
            kind: symbol.kind,
            uri: symbol.uri,
            range: symbol.range,
            selectionRange: symbol.selectionRange,
            children: newChildren || symbol.children,
        } as FishDocumentSymbol;
    }
}



export function getFishDocumentSymbols(uri: string, ...currentNodes: SyntaxNode[]): FishDocumentSymbol[] {
    const symbols: FishDocumentSymbol[] = [];
    for (const node of currentNodes) {
        const childrenSymbols = getFishDocumentSymbols(uri, ...node.children);
        const { shouldCreate, kind, child, parent } = symbolCheck(node);
        if (shouldCreate) {
            symbols.push(FishDocumentSymbol.create(
                child.text,
                new DocumentationStringBuilder(child, parent).toString(),
                kind,
                uri,
                getRange(parent),
                getRange(child),
                childrenSymbols
            ));
            continue;
        }
        symbols.push(...childrenSymbols);
    }
    return symbols;
}

function symbolCheck(node: SyntaxNode): {
    shouldCreate: boolean;
    kind: SymbolKind;
    child: SyntaxNode;
    parent: SyntaxNode;
}{
    let shouldCreate = false;
    let [child, parent] = [ node, node ];
    let kind: SymbolKind = SymbolKind.Null;
    if (isVariableDefinition(node)) {
        parent = node.parent!;
        kind = SymbolKind.Variable;
        shouldCreate = true;
    }
    if (isFunctionDefinition(node)) {
        child = node.firstNamedChild!;
        kind = SymbolKind.Function;
        shouldCreate = true;
    }
    return {
        shouldCreate,
        kind,
        child,
        parent,
    }
}

export function flattenFishDocumentSymbols(symbols: FishDocumentSymbol[]): FishDocumentSymbol[] {
    const queue = [...symbols];
    const result: FishDocumentSymbol[] = [];
    while (queue.length > 0) {
        const symbol = queue.shift();
        if (symbol) result.push(symbol);
        if (symbol && symbol.children) queue.unshift(...symbol.children);
    }
    return result;
}

export function filterLastFishDocumentSymbols(symbols: FishDocumentSymbol[]): FishDocumentSymbol[] {
    const result: FishDocumentSymbol[] = []
    for (const symbol of symbols) {
        const uniqs: FishDocumentSymbol[] = [];
        const dupes = filterLastFishDocumentSymbols(symbol.children)
        while (dupes.length > 0) {
            const child = dupes.pop();
            if (child && uniqs.filter(uniq => uniq.name === child.name).length === 0) {
                uniqs.unshift(child);
                continue;
            }
        }
        result.push(FishDocumentSymbol.copy(symbol, uniqs));
    }
    return result;
}


export function tagsParser(child: SyntaxNode, parent: SyntaxNode, uri: string) {
    return;
}

