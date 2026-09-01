import { useMemo } from "react";
import { AutoFocusExtension } from "@lexical/extension";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { configExtension, defineExtension } from "lexical";
import {
	Box,
	Menu,
	Text,
	Typography,
	useComputedColorScheme,
} from "@mantine/core";
import { SlashMenuPlugin } from "./plugins/SlashMenuPlugin";
import { EquationPlugin } from "./plugins/EquationPlugin/EquationPlugin";
import { HighlightPlugin } from "./plugins/HighlightPlugin/HighlightPlugin";
import { HighlightCreatedPayload } from "./plugins/HighlightPlugin/highlightCommands";
import { ImagePlugin } from "./plugins/ImagePlugin/ImagePlugin";
import { LinkClickPlugin } from "./plugins/LinkPlugin/LinkClickPlugin";
import {
	editorExtensionDependencies,
	editorNodes,
	editorTheme,
} from "./editorExtension";
import styles from "./Editor.module.css";
import { useIsCoarsePointer } from "../../hooks/useIsCoarsePointer";
import useAppSelector from "../../hooks/useAppSelector";
import { selectIsVirtualKeyboardSuppressed } from "../../stores/app/appSelectors";

// @lexical/code-shiki bakes the Shiki theme used at highlight time into
// each CodeNode's serialized JSON, and only re-highlights with the
// tokenizer's current `defaultTheme` when a node has none set. Without
// this, code blocks saved under one color scheme would keep rendering
// with that scheme's colors forever, even after switching themes.
function stripCodeNodeThemes(json: string): string {
	return JSON.stringify(
		JSON.parse(json),
		(key: string, value: unknown): unknown =>
			key === "theme" ? undefined : value,
	);
}

interface EditorProps {
	initialContent?: string;
	autoFocus?: boolean;
	children?: React.ReactNode;
	onHighlightCreated?: (payload: HighlightCreatedPayload) => void;
	/** Extra items for the editor's right-click menu, if any (e.g. `Menu.Item`/`Menu.Sub`). */
	contextMenuItems?: React.ReactNode;
}

export default function Editor({
	initialContent,
	autoFocus = false,
	children,
	onHighlightCreated,
	contextMenuItems,
}: EditorProps) {
	const colorScheme = useComputedColorScheme("light");
	// The floating selection menu already covers this with a coarse pointer.
	const coarsePointer = useIsCoarsePointer();
	const contextMenuDisabled = !contextMenuItems || coarsePointer;
	const keyboardSuppressed = useAppSelector(
		selectIsVirtualKeyboardSuppressed,
	);
	const suppressKeyboard = keyboardSuppressed && coarsePointer;

	const editorExtension = useMemo(
		() =>
			defineExtension({
				dependencies: [
					...editorExtensionDependencies,
					configExtension(AutoFocusExtension, {
						defaultSelection: "rootStart",
						disabled: !autoFocus,
					}),
				],
				theme: {
					...editorTheme,
					text: {
						code: styles["inline-code"],
					},
					code: styles["code-block"],
				},
				name: "editor",
				namespace: "editor",
				nodes: editorNodes,
				$initialEditorState: !initialContent
					? undefined
					: stripCodeNodeThemes(initialContent),
			}),
		// eslint-disable-next-line react-hooks/exhaustive-deps -- only apply initialContent/autoFocus once, at editor creation; colorScheme is the one prop allowed to rebuild the editor, so code blocks re-highlight with the matching Shiki theme
		[colorScheme],
	);

	return (
		<Menu withinPortal shadow="lg">
			<Menu.ContextMenu disabled={contextMenuDisabled}>
				<Typography className={styles.typography}>
					<LexicalExtensionComposer
						extension={editorExtension}
						contentEditable={null}>
						<Box className={styles.anchor}>
							<ContentEditable
								className={styles["content-editable"]}
								inputMode={
									suppressKeyboard ? "none" : undefined
								}
								aria-label="Rich text editor"
								aria-placeholder="Type '/' for commands..."
								placeholder={
									<Text
										className={styles.placeholder}
										c="dimmed">
										Type &apos;/&apos; for commands...
									</Text>
								}
							/>
							<SlashMenuPlugin />
							<EquationPlugin />
							<ImagePlugin />
							<LinkClickPlugin />
							<HighlightPlugin
								onHighlightCreated={onHighlightCreated}
							/>
							{children}
						</Box>
					</LexicalExtensionComposer>
				</Typography>
			</Menu.ContextMenu>
			{!contextMenuDisabled && (
				<Menu.Dropdown>{contextMenuItems}</Menu.Dropdown>
			)}
		</Menu>
	);
}
