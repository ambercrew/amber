import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { $isCodeNode, DEFAULT_CODE_LANGUAGE } from "@lexical/code-core";
import {
	$findMatchingParent,
	$getNodeByKey,
	$getSelection,
	$isRangeSelection,
	COMMAND_PRIORITY_LOW,
	type NodeKey,
} from "lexical";
import { autoUpdate } from "@floating-ui/dom";
import { Box, Select } from "@mantine/core";
import { OPEN_CODE_LANGUAGE_PICKER_COMMAND } from "./codeCommands";
import { codeLanguageOptions, knownCodeLanguage } from "./codeLanguages";

const INSET_PX = 4;

/** The options, plus the block's own language when it isn't one of them. */
function optionsFor(language: string) {
	return knownCodeLanguage(language)
		? codeLanguageOptions
		: [{ value: language, label: language }, ...codeLanguageOptions];
}

interface ActiveCode {
	key: NodeKey;
	language: string;
}

function sameCode(a: ActiveCode | null, b: ActiveCode | null) {
	return a?.key === b?.key && a?.language === b?.language;
}

/** A language picker in the top-right corner of the code block holding the caret. */
export function CodeLanguagePlugin() {
	const [editor] = useLexicalComposerContext();
	const isEditable = useLexicalEditable();
	const [activeCode, setActiveCode] = useState<ActiveCode | null>(null);
	const [focusWithin, setFocusWithin] = useState(false);
	const [dropdownOpened, setDropdownOpened] = useState(false);
	const [floating, setFloating] = useState<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(
		() =>
			editor.registerUpdateListener(({ editorState }) => {
				const next = editorState.read(() => {
					const selection = $getSelection();
					if (!$isRangeSelection(selection)) return null;
					const code = $findMatchingParent(
						selection.anchor.getNode(),
						$isCodeNode,
					);
					if (!$isCodeNode(code)) return null;
					return {
						key: code.getKey(),
						language: code.getLanguage() ?? DEFAULT_CODE_LANGUAGE,
					};
				});
				setActiveCode(current =>
					sameCode(current, next) ? current : next,
				);
			}),
		[editor],
	);

	// Checked once focus has settled: moving from the editor to the picker blurs both for a moment.
	useEffect(() => {
		let frame = 0;
		const check = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				const active = document.activeElement;
				setFocusWithin(
					!!active &&
						(!!editor.getRootElement()?.contains(active) ||
							!!floating?.contains(active)),
				);
			});
		};
		check();
		document.addEventListener("focusin", check);
		document.addEventListener("focusout", check);
		return () => {
			cancelAnimationFrame(frame);
			document.removeEventListener("focusin", check);
			document.removeEventListener("focusout", check);
		};
	}, [editor, floating]);

	const shownCode = focusWithin ? activeCode : null;
	const shownKey = isEditable ? shownCode?.key : undefined;

	useEffect(
		() =>
			editor.registerCommand(
				OPEN_CODE_LANGUAGE_PICKER_COMMAND,
				() => {
					// The picker mounts once the update that made the block has rendered.
					requestAnimationFrame(() => {
						inputRef.current?.focus();
						setDropdownOpened(true);
					});
					return true;
				},
				COMMAND_PRIORITY_LOW,
			),
		[editor],
	);

	useLayoutEffect(() => {
		if (!shownKey || !floating) return;
		const element = editor.getElementByKey(shownKey);
		const anchor = floating.offsetParent;
		if (!element || !anchor) return;
		const update = () => {
			const code = element.getBoundingClientRect();
			const box = anchor.getBoundingClientRect();
			floating.style.top = `${code.top - box.top + INSET_PX}px`;
			floating.style.left = `${code.right - box.left - floating.offsetWidth - INSET_PX}px`;
		};
		return autoUpdate(element, floating, update);
	}, [editor, shownKey, floating]);

	if (!shownCode || !shownKey) return null;

	const language =
		knownCodeLanguage(shownCode.language) ?? shownCode.language;

	const returnToCode = () => {
		setDropdownOpened(false);
		editor.update(() => {
			const code = $getNodeByKey(shownKey);
			if ($isCodeNode(code) && !$getSelection()) code.selectEnd();
		});
		editor.focus();
	};

	const changeLanguage = (language: string | null) => {
		if (!language) return;
		editor.update(() => {
			const code = $getNodeByKey(shownKey);
			if ($isCodeNode(code)) code.setLanguage(language);
		});
		returnToCode();
	};

	return (
		<Box ref={setFloating} pos="absolute" style={{ zIndex: 1 }}>
			<Select
				ref={inputRef}
				aria-label="Code language"
				size="xs"
				w={120}
				maxDropdownHeight={140}
				searchable
				allowDeselect={false}
				data={optionsFor(language)}
				value={language}
				dropdownOpened={dropdownOpened}
				onDropdownOpen={() => setDropdownOpened(true)}
				onDropdownClose={() => setDropdownOpened(false)}
				onChange={changeLanguage}
				// Also on click, as a click's mouseup drops the selection made on focus.
				onFocus={event => event.currentTarget.select()}
				onClick={event => event.currentTarget.select()}
				onKeyDown={event => {
					if (event.key === "Escape" && !dropdownOpened) {
						returnToCode();
					}
				}}
			/>
		</Box>
	);
}
