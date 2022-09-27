import {Hover, MarkupContent, MarkupKind} from 'vscode-languageserver-protocol/node';
import {SyntaxNode} from 'web-tree-sitter';
import {execCommandDocs, execCommandType, CompletionArguments} from './utils/exec';
import {getNodes, getNodeText} from './utils/tree-sitter';



export type markdownFiletypes = 'fish' | 'man';

export function enrichToMarkdown(doc: string): MarkupContent {
    return {
        kind: MarkupKind.Markdown,
        value: [
            doc.trim(),
        ].join()
    }
}

export function enrichToCodeBlockMarkdown(doc: string, filetype:markdownFiletypes='fish'): MarkupContent {
    return {
        kind: MarkupKind.Markdown,
        value: [
            '```' + filetype,
            doc.trim(),
            '```'
        ].join('\n')
    }
}


export function enrichCommandArg(doc: string): MarkupContent {
    const docArr = doc.split('\t', 1);
    const arg = '__' + docArr[0].trim() + '__'
    const desc = '_' + docArr[1].trim() + '_'
    const enrichedDoc = [
        arg,
        desc
    ].join('  ')
    return enrichToMarkdown(enrichedDoc)
}


export function enrichToPlainText(doc: string): MarkupContent  {
    return {
        kind: MarkupKind.PlainText,
        value: doc.trim()
    }
}



export async function documentationHoverProvider(cmd: string) : Promise<Hover | null> {
    const cmdDocs = await execCommandDocs(cmd);
    const cmdType = await execCommandType(cmd);

    if (!cmdType || !cmdDocs) { 
        return null;
    } else {
        return {
            contents: cmdType == 'command' 
            ? enrichToCodeBlockMarkdown(cmdDocs, 'man')
            : enrichToCodeBlockMarkdown(cmdDocs, 'fish')
        }
    }
}

function commandStringHelper(cmd: string) {
    const cmdArray = cmd.split(' ', 1)
    return cmdArray.length > 1
        ? '___' + cmdArray[0] + '___' + ' ' + cmdArray[1] 
        :'___' + cmdArray[0] + '___'  
}

export function documentationHoverCommandArg(root: SyntaxNode, cmp: CompletionArguments) : Hover {
    let text = '';
    const argsArray = [...cmp.args.keys()]
    for (const node of getNodes(root)) {
        const nodeText = getNodeText(node)
        if (nodeText.startsWith('-') && argsArray.includes(nodeText)) {
            text += '\n' + '_' + nodeText + '_ ' + cmp.args.get(nodeText)
        }
    }
    const cmd = commandStringHelper(cmp.command.trim())
    return {contents: 
        enrichToMarkdown(
            [
                cmd,
                '---',
                text.trim()
            ].join('\n')
        )
    }
}

