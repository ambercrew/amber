import { useCallback, useMemo, useState } from "react";
import { flushSync } from "react-dom";
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
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { SlashMenuPlugin } from "./plugins/SlashMenuPlugin";
import { EquationExtension } from "./plugins/EquationPlugin/EquationExtension";
import { CodeHighlightExtension } from "./plugins/CodeHighlightPlugin/CodeHighlightExtension";
import {
	HighlightCreatedListener,
	HighlightPlugin,
} from "./plugins/HighlightPlugin/HighlightPlugin";
import { HighlightCreatedPayload } from "./plugins/HighlightPlugin/highlightCommands";
import { ImagePlugin } from "./plugins/ImagePlugin/ImagePlugin";
import { EquationEditingPlugin } from "./plugins/EquationPlugin/EquationEditingPlugin";
import {
	ImageMenuItems,
	ImageMenuItemsContext,
} from "./plugins/ImagePlugin/imageMenuContext";
import {
	ImageOcclusionOverlayContext,
	RenderOcclusionOverlay,
} from "./plugins/ImagePlugin/imageOcclusionOverlayContext";
import { LinkClickPlugin } from "./plugins/LinkPlugin/LinkClickPlugin";
import { LinkOpenerProvider } from "./plugins/LinkPlugin/LinkOpenerProvider";
import { useLinkOpener } from "./plugins/LinkPlugin/linkOpenerContext";
import {
	editorExtensionDependencies,
	editorNodes,
	editorTheme,
} from "./editorExtension";
import styles from "./Editor.module.css";
import { useIsCoarsePointer } from "../../hooks/useIsCoarsePointer";
import useAppSelector from "../../hooks/useAppSelector";
import { selectIsVirtualKeyboardSuppressed } from "../../stores/app/appSelectors";

interface EditorProps {
	initialContent?: string;
	children?: React.ReactNode;
	onHighlightCreated?: (payload: HighlightCreatedPayload) => void;
	contextMenuItems?: React.ReactNode;
	/** Called when the right-click menu closes. */
	onContextMenuClose?: () => void;
	/** Extra actions for an image's popover, e.g. image occlusion. */
	imageMenuItems?: ImageMenuItems;
	/** Draws an occlusion card's masks over its image. */
	renderOcclusionOverlay?: RenderOcclusionOverlay;
}

export default function Editor({
	imageMenuItems,
	renderOcclusionOverlay,
	...props
}: EditorProps) {
	// Context only because Lexical renders images via `decorate()`, which takes no props.
	return (
		<LinkOpenerProvider>
			<ImageMenuItemsContext value={imageMenuItems ?? null}>
				<ImageOcclusionOverlayContext
					value={renderOcclusionOverlay ?? null}>
					<EditorContent {...props} />
				</ImageOcclusionOverlayContext>
			</ImageMenuItemsContext>
		</LinkOpenerProvider>
	);
}

function EditorContent({
	initialContent,
	children,
	onHighlightCreated,
	contextMenuItems,
	onContextMenuClose,
}: EditorProps) {
	const colorScheme = useComputedColorScheme("light");
	const { openLink } = useLinkOpener();
	const [contextMenuLinkUrl, setContextMenuLinkUrl] = useState<string | null>(
		null,
	);
	// The floating selection menu already covers this with a coarse pointer.
	const coarsePointer = useIsCoarsePointer();
	const contextMenuDisabled =
		coarsePointer || (!contextMenuItems && !contextMenuLinkUrl);
	const keyboardSuppressed = useAppSelector(
		selectIsVirtualKeyboardSuppressed,
	);
	const suppressKeyboard = keyboardSuppressed && coarsePointer;

	const handleContextMenuLink = useCallback((url: string | null) => {
		flushSync(() => setContextMenuLinkUrl(url));
	}, []);

	const handleContextMenu = (event: React.MouseEvent) => {
		const inContent =
			event.target instanceof Element &&
			event.target.closest("[contenteditable]") !== null;
		if (inContent) return;

		setContextMenuLinkUrl(null);
		if (!contextMenuItems) event.preventDefault();
	};

	const editorExtension = useMemo(
		() =>
			defineExtension({
				dependencies: [
					...editorExtensionDependencies,
					EquationExtension,
					configExtension(CodeHighlightExtension, {
						theme:
							colorScheme === "dark"
								? "gruvbox-dark-medium"
								: "gruvbox-light-soft",
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
				$initialEditorState:
					initialContent === "" ? undefined : initialContent,
			}),
		// eslint-disable-next-line react-hooks/exhaustive-deps -- only apply initialContent once, at editor creation; colorScheme is the one prop allowed to rebuild the editor, so code blocks re-highlight with the matching Shiki theme
		[colorScheme],
	);

	return (
		<Menu withinPortal shadow="lg" onClose={onContextMenuClose}>
			<Menu.ContextMenu disabled={contextMenuDisabled}>
				<Typography
					className={styles.typography}
					onContextMenu={handleContextMenu}>
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
							<ImagePlugin />
							<EquationEditingPlugin />
							<LinkClickPlugin
								onContextMenuLink={handleContextMenuLink}
							/>
							<HighlightPlugin />
							{onHighlightCreated && (
								<HighlightCreatedListener
									onHighlightCreated={onHighlightCreated}
								/>
							)}
							{children}
						</Box>
					</LexicalExtensionComposer>
				</Typography>
			</Menu.ContextMenu>
			{!contextMenuDisabled && (
				<Menu.Dropdown>
					{contextMenuLinkUrl && (
						<Menu.Item
							leftSection={<ArrowSquareOutIcon size={16} />}
							onClick={() => openLink(contextMenuLinkUrl)}>
							Open link
						</Menu.Item>
					)}
					{contextMenuLinkUrl && contextMenuItems && <Menu.Divider />}
					{contextMenuItems}
				</Menu.Dropdown>
			)}
		</Menu>
	);
}
