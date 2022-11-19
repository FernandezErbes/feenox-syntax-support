import {
	createConnection,
	ProposedFeatures,
	InitializeParams,
	CompletionItem,
	CompletionItemKind,
	TextDocuments,
	TextDocumentPositionParams,
	InitializeResult,
	Position
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

import * as fs from 'fs';
import * as path from 'path';

const connection = createConnection(ProposedFeatures.all);

const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let feenoxItemsCache: Array<CompletionItem>;

connection.onInitialize((params: InitializeParams) => {
	const result: InitializeResult = {
		capabilities: {
			completionProvider: {
				resolveProvider: true
			}
		}
	};
	
	return result;
});

function addCompletionItemsFromDocument(
	textDocumentPosition: TextDocumentPositionParams,
	completionItems: Array<CompletionItem>): void {
	const document = documents.get(textDocumentPosition.textDocument.uri);
	const userLabels = getUserLabelsFromDocument(
		document, textDocumentPosition.position, completionItems);
	userLabels.forEach(label => addCompletionItem(
		label, CompletionItemKind.Text, completionItems));
}

function getUserLabelsFromDocument(document: TextDocument | undefined,
	caretPosition: Position,
	itemsToDelete: Array<CompletionItem>): Set<string> {
	const text = document?.getText();
	// Get lines of code, we don't want to search on comment lines
	const codeLines = text?.match(/^[^#\n]+/gm);
	const userLabels = new Set<string>();

	if (codeLines) {
		for (const line of codeLines) {
			// Discard comments in line, if any
			const code = line.split('#')[0];

			// Match labels that can contain numbers, but not numbers alone
			const found = code.match(/(?![.\de-])[\w.-]+\b(?<!\b[\d.])/g);
			if (found) {
				found.forEach(item => userLabels.add(item));
			}
		}
	}

	// Remove the label that the user is typing
	const labelBeingTyped = getLabelBeingTyped(document, caretPosition);
	if (labelBeingTyped) {
		userLabels.delete(labelBeingTyped);
	}

	// Remove labels that they user might have already typed
	itemsToDelete.forEach(item => userLabels.delete(item.label));

	return userLabels;
}

function getLabelBeingTyped(document: TextDocument | undefined,
	caretPosition: Position): string | undefined {
	const startPosition = Position.create(caretPosition.line, 0);
	const line = document?.getText({start: startPosition, end: caretPosition});
	const labelBeingTyped = line?.split(' ').at(-1);
	return labelBeingTyped;
}

function getFeenoxCompletionItems(): Array<CompletionItem> {
	// Don't recompute FeenoX completion items every time, they're always the same
	if (feenoxItemsCache === undefined) {
		feenoxItemsCache = new Array<CompletionItem>();
		addFeenoxItemsFromFile(
			'functions', CompletionItemKind.Function, feenoxItemsCache);
		addFeenoxItemsFromFile(
			'keys', CompletionItemKind.Keyword, feenoxItemsCache);
		addFeenoxItemsFromFile(
			'variables', CompletionItemKind.Variable, feenoxItemsCache);
	}

	// Deep copy the FeenoX completion items, we don't want the consumer of this
	// function to modify the cache
	return [...feenoxItemsCache];
}

function addFeenoxItemsFromFile(
	filename: string,
	kind: CompletionItemKind,
	completionItems: Array<CompletionItem>): void {
	const itemLabels = getFeenoXLabelsFromFile(filename);
	itemLabels.forEach(label => addCompletionItem(label, kind, completionItems));
}

function getFeenoXLabelsFromFile(filename: string): Array<string> {
	const filepath = path.join(__dirname, '..', '..', 'data', filename);
	const contents = fs.readFileSync(filepath).toString();
	const labels = contents.split(',');
	return labels;
}

function addCompletionItem(
	label: string,
	kind: CompletionItemKind,
	completionItems: Array<CompletionItem>): void {
	completionItems.push({
		label: label,
		kind: kind,
		data: completionItems.length
	});
}

connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): Array<CompletionItem> => {
		const completionItems = getFeenoxCompletionItems();
		addCompletionItemsFromDocument(_textDocumentPosition, completionItems);
		return completionItems;
	}
);

connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		// TODO: Return the signature of the FeenoX functions when available
		return item;
	}
);

documents.listen(connection);

connection.listen();
