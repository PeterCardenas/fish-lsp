import Parser, { Tree, SyntaxNode } from 'web-tree-sitter';
import * as NodeTypes from './node-types'
import { gatherSiblingsTillEol } from './node-types';
import { pathToRelativeFunctionName, uriInUserFunctions } from './translation';
import { ancestorMatch, firstAncestorMatch } from './tree-sitter';

type ScopeTag = 'global' | 'universal' | 'local'  | 'function';
export interface DefinitionScope {
    scopeNode: SyntaxNode;
    scopeTag: ScopeTag;
}

export namespace DefinitionScope {
    export function create(scopeNode: SyntaxNode , scopeTag: 'global' | 'universal' | 'local' | 'function'): DefinitionScope {
        return {
            scopeNode,
            scopeTag,
        }
    }
}

export class VariableDefinitionFlag { 
    public short: string;
    public long: string;

    constructor(short: string, long: string) {
        this.short = short;
        this.long = long;
    }

    isMatch(node: SyntaxNode) {
        if (!NodeTypes.isOption(node)) return false;
        if (NodeTypes.isShortOption(node)) return node.text.slice(1).split('').includes(this.short);
        if (NodeTypes.isLongOption(node)) return node.text.slice(2) === this.long;
        return false;
    }

    get kind() {
        return this.long
    }
}

const variableDefinitionFlags = [
    new VariableDefinitionFlag('g', 'global'),
    new VariableDefinitionFlag('l', 'local'),
    //new VariableDefinitionFlag('x', 'export'),
    new VariableDefinitionFlag('f', 'function'),
    new VariableDefinitionFlag('U', 'universal'),
]

const hasParentFunction = (node: SyntaxNode) => {
    return !!firstAncestorMatch(node, NodeTypes.isFunctionDefinition);
}

function getMatchingFlags(focusedNode: SyntaxNode, nodes: SyntaxNode[]) {
    for (const node of nodes) {
        const match = variableDefinitionFlags.find(flag => flag.isMatch(node))
        if (match) {
            return match;
        }
    }
    return hasParentFunction(focusedNode)
        ? new VariableDefinitionFlag("f", "function")
        : new VariableDefinitionFlag("l", "local");
}

function findScopeFromFlag(node: SyntaxNode, flag: VariableDefinitionFlag) {
    let scopeNode: SyntaxNode | null = node.parent!;
    let scopeFlag = 'local';
    switch (flag.kind) {
        case "global":
            scopeNode = firstAncestorMatch(node, NodeTypes.isProgram)
            scopeFlag = 'global'
            break;
        case "universal":
            scopeNode = firstAncestorMatch(node, NodeTypes.isProgram)
            scopeFlag = 'universal'
            break;
        case "local":
            scopeNode = firstAncestorMatch(node, NodeTypes.isScope)
            scopeFlag = 'local'
            break;
        case "function":
            scopeNode = firstAncestorMatch(node, NodeTypes.isFunctionDefinition)
            scopeFlag = 'function'
            break;
        case "for_scope":
            scopeNode = firstAncestorMatch(node, NodeTypes.isFunctionDefinition)
            scopeFlag = 'function'
            if (!scopeNode) {
                scopeNode = firstAncestorMatch(node, NodeTypes.isProgram)
                scopeFlag = 'global'
            }
            break;
        default:
            scopeNode = firstAncestorMatch(node, NodeTypes.isScope)
            scopeFlag = 'local'
            break;
    }

    const finalScopeNode = scopeNode || node;
    return DefinitionScope.create(finalScopeNode, scopeFlag as ScopeTag)
}



export function getVariableScope(node: SyntaxNode) {

    const definitionNodes: SyntaxNode[] = expandEntireVariableLine(node)
    const keywordNode = definitionNodes[0];

    let matchingFlag = null;

    switch (keywordNode.text) {
        case 'for':
            matchingFlag = new VariableDefinitionFlag('', 'for_scope');
            break;
        case 'set':
        case 'read':
        case 'function':
        default: 
            matchingFlag = getMatchingFlags(node, definitionNodes)
            break;
    }

    const scope = findScopeFromFlag(node, matchingFlag)
    return scope;
}


export function getScope(uri: string, node: SyntaxNode) {
    if (NodeTypes.isFunctionDefinitionName(node)) {
        const loadedName = pathToRelativeFunctionName(uri);
        return loadedName === node.text || loadedName === "config" ?
                DefinitionScope.create(firstAncestorMatch(node, NodeTypes.isProgram)!, 'global') :
                DefinitionScope.create(firstAncestorMatch(node, NodeTypes.isProgram)!, 'local')
    } else if (NodeTypes.isVariableDefinitionName(node)) {
        return getVariableScope(node)
    }
    return DefinitionScope.create(firstAncestorMatch(node, NodeTypes.isScope)!, 'local');
}

export function expandEntireVariableLine(node: SyntaxNode): SyntaxNode[] {
    const results: SyntaxNode[] = [node]

    let current = node.previousSibling
    while (current !== null) {
        if (!current || NodeTypes.isNewline(current)) break;
        results.unshift(current)
        current = current.previousSibling
    }

    current = node.nextSibling
    while (current !== null) {
        if (!current || NodeTypes.isNewline(current)) break;
        results.push(current)
        current = current.nextSibling
    }

    return results;
}