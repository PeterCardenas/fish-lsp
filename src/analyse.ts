import {doc} from 'prettier';
import {
    CompletionItem,
    Connection,
    Hover,
    Location,
    TextDocumentPositionParams,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import Parser, { SyntaxNode, Point, Range, Tree } from "web-tree-sitter";
import {
    documentationHoverCommandArg,
    documentationHoverProvider,
    enrichToCodeBlockMarkdown,
    HoverFromCompletion,
} from "./documentation";
import {
    CompletionArguments,
    execFindDependency,
    generateCompletionArguments,
} from "./utils/exec";
import { getAllFishLocations } from "./utils/locations";
import {
    findDefinedVariable,
    findLastVariableRefrence,
    findParentCommand,
    findFunctionScope,
    isCommand,
    isFunctionDefinintion,
    isVariable,
    isVariableDefintion,
    hasParentFunction,
    isStatement,
} from "./utils/node-types";
import {
    findNodeAt,
    getNodes,
    getNodeText,
    getRange,
} from "./utils/tree-sitter";

export class MyAnalyzer {
    private parser: Parser;
    public uriToSyntaxTree: { [uri: string]: SyntaxTree | null };
    private globalDocs: { [uri: string]: Hover };
    private completions: { [uri: string]: CompletionArguments };
    private dependencies: { [cmd: string]: string };

    constructor(parser: Parser) {
        this.parser = parser;
        this.uriToSyntaxTree = {};
        this.globalDocs = {};
        this.completions = {};
        this.dependencies = {};
    }

    async initialize(uri: string) {
        this.uriToSyntaxTree[uri] = null;
    }

    async analyze(uri: string, document: TextDocument) {
        const tree = this.uriToSyntaxTree[uri]
        if (tree === undefined) {
            this.uriToSyntaxTree[uri] = generateInitialSyntaxTree(
                this.parser,
                document
            );
        }
        if (!tree) {
            this.uriToSyntaxTree[uri] = generateInitialSyntaxTree(
                this.parser,
                document
            );
        }
        tree?.ensureAnalyzed()

        //const uniqCommands = this.uriToSyntaxTree[uri]
        //    ?.getUniqueCommands()
        //    .filter((cmd: string) => this.globalDocs[cmd] === undefined)!;

        //if (!uniqCommands) return;
        //for (const cmd of uniqCommands) {
        //    const docs = await documentationHoverProvider(cmd);
        //    //const cmps = await generateCompletionArguments(cmd)
        //    if (docs) this.globalDocs[cmd] = docs;
        //    //if (cmps) this.completions[cmd] = cmps;
        //    if (this.dependencies[cmd] === undefined) {
        //        const path = await execFindDependency(cmd);
        //        if (path.trim() != "") {
        //            this.dependencies[cmd] = path;
        //        }
        //    }
        //}
    }

    async complete(params: TextDocumentPositionParams) {
        const uri = params.textDocument.uri;
        const tree = this.uriToSyntaxTree[uri];
        const node = this.nodeAtPoint(
            params.textDocument.uri,
            params.position.line,
            params.position.character
        );
        const text = this.wordAtPoint(
            params.textDocument.uri,
            params.position.line,
            params.position.character
        );
        if (!node || !text) {
            return;
        }
        const cmd = findParentCommand(node);
    }

    /**
     * Find the node at the given point.
     */
    public nodeAtPoint(
        uri: string,
        line: number,
        column: number
    ): Parser.SyntaxNode | null {
        const document = this.uriToSyntaxTree[uri];
        if (!document?.rootNode) {
            // Check for lacking rootNode (due to failed parse?)
            return null;
        }

        return document.rootNode.descendantForPosition({ row: line, column });
    }

    /**
     * Find the full word at the given point.
     */
    public wordAtPoint(
        uri: string,
        line: number,
        column: number
    ): string | null {
        const node = this.nodeAtPoint(uri, line, column);

        if (!node || node.childCount > 0 || node.text.trim() === "") {
            return null;
        }

        return node.text.trim();
    }

    public nodeIsLocal(uri: string, node: SyntaxNode): Hover | void {
        const tree = this.uriToSyntaxTree[uri];
        if (!tree) return;

        tree.ensureAnalyzed()
        const result = tree.getLocalFunctionDefinition(node) || tree.getNearestVariableDefinition(node)
        if (!result) return
        return {
            contents: enrichToCodeBlockMarkdown(result.text, 'fish'),
            range: getRange(result),
        };
    }

    public async getHover(params: TextDocumentPositionParams): Promise<Hover | void> {
        const uri = params.textDocument.uri;
        const line = params.position.line;
        const character = params.position.character;
        const tree = this.uriToSyntaxTree[uri];
        if (!tree) {return ;}
        const node = this.nodeAtPoint(uri,line,character)
        const text = this.wordAtPoint(uri,line,character)
        if (!node || !text) {return; }
        //if (this.globalDocs[text]) {return this.globalDocs[text];}

        const docs = await documentationHoverProvider(text);
        //const cmdNode = findParentCommand(node);
        //if (!docs && cmdNode) {
        //    const cmdDocs = await documentationHoverProvider(cmdNode?.text);
        //    if (cmdDocs) {
        //        return cmdDocs
        //    } 
        //}
        if (docs) {
            //this.globalDocs[text] = docs
            return docs;
        }
        return await this.getHoverFallback(uri, node)
    }

    public async getHoverFallback(uri: string, currentNode: SyntaxNode): Promise<Hover | void> {
        const tree = this.uriToSyntaxTree[uri];
        if (!tree) { return }

        const cmdNode = findParentCommand(currentNode);
        if (!cmdNode) return
        const hoverCmp = new HoverFromCompletion(cmdNode, currentNode)
        let hover : Hover | void;
        if (currentNode.text.startsWith("-")) {
            hover = await hoverCmp.generateForFlags()
        } else {
            hover = await hoverCmp.generate() 
        }
        if (hover) return hover;
        //if (currentNode.text.startsWith('-')) {
        //}
        return 
    }

    getTreeForUri(uri: string): SyntaxTree | null {
        if (!this.uriToSyntaxTree[uri]) {
            return null;
        }
        return this.uriToSyntaxTree[uri];
    }
}

function generateInitialSyntaxTree(parser: Parser, document: TextDocument) {
    return new SyntaxTree(parser, document);
}


function firstNodeBeforeSecondNodeComaprision(
    firstNode: SyntaxNode,
    secondNode: SyntaxNode
) {
    return (
        firstNode.startPosition.row < secondNode.startPosition.row &&
        firstNode.startPosition.column < secondNode.startPosition.column &&
        firstNode.text == secondNode.text
    );
}

//function difference(oldArray: any[], newArray: any[]) {
//    return newArray.filter((node) => !oldArray.includes(node));
//}

export class SyntaxTree {
    public document: TextDocument;
    public parser: Parser;
    public rootNode: SyntaxNode;
    public tree: Tree;
    public nodes: SyntaxNode[] = [];
    public functions: SyntaxNode[] = [];
    public commands: SyntaxNode[] = [];
    public variable_definitions: SyntaxNode[] = [];
    public variables: SyntaxNode[] = [];
    public statements: SyntaxNode[] = [];
    public locations: Location[] = [] ;

    constructor( parser: Parser, document: TextDocument) {
        this.parser = parser;
        this.document = document;
        this.tree = this.parser.parse(this.document.getText())
        this.rootNode = this.tree.rootNode;
        this.tree = this.tree;
        this.clearAll();
    }

    public ensureAnalyzed() {
        this.clearAll()
        this.parser.parse(this.document.getText())
        const newNodes = getNodes(this.rootNode)
        for (const newNode of getNodes(this.rootNode)) {
            if (isCommand(newNode)) {
                this.commands.push(newNode)
            }
            if (isFunctionDefinintion(newNode)) {
                this.functions.push(newNode)
            }
            if (isVariable(newNode)) {
                this.variables.push(newNode)
            }
            if (isVariableDefintion(newNode)) {
                this.variable_definitions.push(newNode)
            }
            if (isStatement(newNode)) {
                this.statements.push(newNode)
            }
        }
        //this.commands = [...newNodes.filter((node) => isCommand(node))];
        //this.functions = [
        //    ...newNodes.filter((node) => isFunctionDefinintion(node))
        //]
        //this.variables = [...newNodes.filter((node) => isVariable(node))];
        //this.variable_defintions = [
        //    ...newNodes.filter((node) => isVariableDefintion(node))
        //]
        return newNodes;
    }

    public clearAll() {
        this.nodes = [];
        this.functions = [];
        this.variables = [];
        this.variable_definitions = [];
        this.commands = [];
    }

    public getUniqueCommands(): string[] {
        return [
            ...new Set(
                this.commands
                    .map((node: SyntaxNode) => node?.firstChild?.text.trim() || "")
                    .filter((nodeStr) => nodeStr != "")
            ),
        ];
    }

    public getNodeRanges() {
        return this.nodes.map((node) => getRange(node));
    }

    public hasRoot(): boolean {
        return this.rootNode != null;
    }

    public getNodes() {
        this.ensureAnalyzed();
        return this.nodes;
    }

    public getLocalFunctionDefinition(searchNode: SyntaxNode) {
        for (const func of getNodes(this.rootNode)) {
            if (isFunctionDefinintion(func) && func.children[1]?.text == searchNode.text) {
                return func
            }
        }
        return undefined

    }

    // techincally this is nearest variable refrence that is a definition
    public getNearestVariableDefinition(searchNode: SyntaxNode) {
        if (!isVariable(searchNode)) return undefined
        const varaibleDefinitions: SyntaxNode[] = [];
        const functionScope = findFunctionScope(searchNode) 
        const scopedVariableLocations: SyntaxNode[] = [
            ...getNodes(functionScope),
            ...this.getOutmostScopedNodes()
        ]
        for (const node of scopedVariableLocations) {
            if (isVariableDefintion(node) && firstNodeBeforeSecondNodeComaprision(node, searchNode)) {
                const v = findDefinedVariable(node);
                if (!v || !v?.parent) continue;
                varaibleDefinitions.push(v);
            }
        }
        const result = varaibleDefinitions.pop()
        if (!result || !result.parent) return undefined
        return result.parent
    }

    // global nodes are nodes that are not defined in a function
    // (i.e. stuff in config.fish)
    public getOutmostScopedNodes() {
        const allNodes = [ 
            ...getNodes(this.rootNode)
                .filter(n => !hasParentFunction(n))
        ].filter(n => n.type != 'program')
        return allNodes
    }
}
