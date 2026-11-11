import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
	LexicalTypeaheadMenuPlugin,
	useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { $getRoot, LexicalEditor, TextNode } from "lexical";
import { Group, Paper, ScrollArea, Text, UnstyledButton } from "@mantine/core";
import { BlockOption, getBlockOptions } from "./blockOptions";
import styles from "../Editor.module.css";

export function SlashMenuPlugin() {
	const [editor] = useLexicalComposerContext();
	const [queryString, setQueryString] = useState<string | null>(null);

	const allOptions = useMemo(() => getBlockOptions(editor), [editor]);

	const options = useMemo(
		() =>
			queryString ? filterOptions(allOptions, queryString) : allOptions,
		[allOptions, queryString],
	);

	const onSelectOption = useCallback(
		(
			selectedOption: BlockOption,
			nodeToRemove: TextNode | null,
			closeMenu: () => void,
		) => {
			editor.update(() => {
				nodeToRemove?.remove();
				selectedOption.onSelect();
			});
			closeMenu();
		},
		[editor],
	);

	const checkForTriggerMatch = useBasicTypeaheadTriggerMatch("/", {
		minLength: 0,
		allowWhitespace: false,
	});

	// Only open the menu when the text content actually changed (typing),
	// not when the cursor merely moved next to an existing "/".
	const lastTextContentRef = useRef("");
	const triggerFn = useCallback(
		(text: string, editorInstance: LexicalEditor) => {
			const textContent = editorInstance.read(() =>
				$getRoot().getTextContent(),
			);
			const textContentChanged =
				textContent !== lastTextContentRef.current;
			lastTextContentRef.current = textContent;
			return textContentChanged
				? checkForTriggerMatch(text, editorInstance)
				: null;
		},
		[checkForTriggerMatch],
	);

	return (
		<LexicalTypeaheadMenuPlugin<BlockOption>
			onQueryChange={setQueryString}
			onSelectOption={onSelectOption}
			triggerFn={triggerFn}
			options={options}
			menuRenderFn={(
				anchorElementRef,
				{ selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
			) => {
				if (!anchorElementRef.current || options.length === 0)
					return null;
				return createPortal(
					<Paper withBorder shadow="lg" p={4} miw={220}>
						<ScrollArea.Autosize mah={300}>
							{options.map((option, i) => (
								<UnstyledButton
									key={option.key}
									ref={
										// eslint-disable-next-line @typescript-eslint/unbound-method
										option.setRefElement as React.Ref<HTMLButtonElement>
									}
									w="100%"
									p="xs"
									className={styles["slash-menu-option"]}
									bg={
										i === selectedIndex
											? "var(--mantine-primary-color-filled)"
											: undefined
									}
									c={
										i === selectedIndex
											? "white"
											: undefined
									}
									onClick={() =>
										selectOptionAndCleanUp(option)
									}
									onMouseEnter={() => setHighlightedIndex(i)}>
									<Group gap="xs">
										<option.Icon size={16} />
										<Text size="md">{option.title}</Text>
									</Group>
								</UnstyledButton>
							))}
						</ScrollArea.Autosize>
					</Paper>,
					anchorElementRef.current,
				);
			}}
		/>
	);
}

function filterOptions(options: BlockOption[], query: string): BlockOption[] {
	const lower = query.toLowerCase();
	return options.filter(
		opt =>
			opt.title.toLowerCase().includes(lower) ||
			opt.keywords.some(k => k.toLowerCase().includes(lower)),
	);
}
