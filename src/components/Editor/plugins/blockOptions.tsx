import { $createCodeNode } from "@lexical/code-core";
import {
	INSERT_ORDERED_LIST_COMMAND,
	INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list";
import { MenuOption } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import {
	$createParagraphNode,
	$getSelection,
	$isRangeSelection,
	LexicalEditor,
} from "lexical";
import {
	CodeBlockIcon,
	ListBulletsIcon,
	ListNumbersIcon,
	ParagraphIcon,
	QuotesIcon,
	TextHOneIcon,
	TextHThreeIcon,
	TextHTwoIcon,
	type Icon,
} from "@phosphor-icons/react";
import { OPEN_CODE_LANGUAGE_PICKER_COMMAND } from "./CodePlugin/codeCommands";

export type BlockIcon = Icon;

interface BlockOptionConfig {
	Icon: BlockIcon;
	keywords?: string[];
	onSelect: () => void;
}

export class BlockOption extends MenuOption {
	title: string;
	Icon: BlockIcon;
	keywords: string[];
	onSelect: () => void;

	constructor(
		title: string,
		{ Icon, keywords = [], onSelect }: BlockOptionConfig,
	) {
		super(title);
		this.title = title;
		this.Icon = Icon;
		this.keywords = keywords;
		this.onSelect = onSelect;
	}
}

export function getBlockOptions(editor: LexicalEditor): BlockOption[] {
	return [
		new BlockOption("Text", {
			Icon: ParagraphIcon,
			keywords: ["paragraph", "text", "p", "normal"],
			onSelect: () =>
				editor.update(() => {
					const selection = $getSelection();
					if ($isRangeSelection(selection)) {
						$setBlocksType(selection, () => $createParagraphNode());
					}
				}),
		}),
		new BlockOption("Heading 1", {
			Icon: TextHOneIcon,
			keywords: ["heading", "title", "h1"],
			onSelect: () =>
				editor.update(() => {
					const selection = $getSelection();
					if ($isRangeSelection(selection)) {
						$setBlocksType(selection, () =>
							$createHeadingNode("h1"),
						);
					}
				}),
		}),
		new BlockOption("Heading 2", {
			Icon: TextHTwoIcon,
			keywords: ["heading", "subtitle", "h2"],
			onSelect: () =>
				editor.update(() => {
					const selection = $getSelection();
					if ($isRangeSelection(selection)) {
						$setBlocksType(selection, () =>
							$createHeadingNode("h2"),
						);
					}
				}),
		}),
		new BlockOption("Heading 3", {
			Icon: TextHThreeIcon,
			keywords: ["heading", "h3"],
			onSelect: () =>
				editor.update(() => {
					const selection = $getSelection();
					if ($isRangeSelection(selection)) {
						$setBlocksType(selection, () =>
							$createHeadingNode("h3"),
						);
					}
				}),
		}),
		new BlockOption("Bulleted List", {
			Icon: ListBulletsIcon,
			keywords: ["bulleted list", "unordered list", "ul"],
			onSelect: () =>
				editor.dispatchCommand(
					INSERT_UNORDERED_LIST_COMMAND,
					undefined,
				),
		}),
		new BlockOption("Numbered List", {
			Icon: ListNumbersIcon,
			keywords: ["numbered list", "ordered list", "ol"],
			onSelect: () =>
				editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined),
		}),
		new BlockOption("Quote", {
			Icon: QuotesIcon,
			keywords: ["quote", "blockquote"],
			onSelect: () =>
				editor.update(() => {
					const selection = $getSelection();
					if ($isRangeSelection(selection)) {
						$setBlocksType(selection, () => $createQuoteNode());
					}
				}),
		}),
		new BlockOption("Code Block", {
			Icon: CodeBlockIcon,
			keywords: ["code", "codeblock", "snippet", "pre"],
			onSelect: () => {
				editor.update(() => {
					const selection = $getSelection();
					if ($isRangeSelection(selection)) {
						$setBlocksType(selection, () =>
							$createCodeNode("plaintext"),
						);
					}
				});
				editor.dispatchCommand(
					OPEN_CODE_LANGUAGE_PICKER_COMMAND,
					undefined,
				);
			},
		}),
	];
}
