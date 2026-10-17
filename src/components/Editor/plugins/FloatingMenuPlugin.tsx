import { useCallback, useEffect, useRef, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
	$getSelection,
	$isRangeSelection,
	COMMAND_PRIORITY_LOW,
	KEY_DOWN_COMMAND,
	LexicalEditor,
	RangeSelection,
} from "lexical";
import {
	MANTINE_TRANSITIONS,
	MantineColor,
	useMantineTheme,
} from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import { isBackwardSelection, selectionEndRect } from "./selectionEndRect";
import { useIsCoarsePointer } from "../../../hooks/useIsCoarsePointer";
import styles from "../Editor.module.css";
import FloatingMenuBar, {
	FloatingMenuBarItem,
} from "../../FloatingMenuBar/FloatingMenuBar";
import { matchesShortcut } from "../../../commands/useAppHotkeys";
import { useIsEditorFocused } from "../hooks/useIsEditorFocused";

export interface FloatingMenuButton {
	divider?: false;
	name: string;
	title: string;
	label?: string;
	showLabel?: boolean;
	color?: MantineColor;
	Icon: React.ComponentType<{ size?: number }>;
	/** Runs the button while its selection applies, even with the menu hidden. */
	shortcut?: string;
	/** Let the shortcut act on a collapsed caret, not just a selected range. */
	actsOnCaret?: boolean;
	onClick: (
		editor: LexicalEditor,
		isActive: boolean,
		closeMenu: () => void,
	) => void;
	isActive: (selection: RangeSelection) => boolean;
	isVisible?: (selection: RangeSelection) => boolean;
}

export interface FloatingMenuDivider {
	divider: true;
	name: string;
}

export type FloatingMenuItem = FloatingMenuButton | FloatingMenuDivider;

function isFloatingMenuDivider(
	item: FloatingMenuItem,
): item is FloatingMenuDivider {
	return !!item.divider;
}

interface Props {
	buttons: FloatingMenuItem[];
}

// Mantine's own `pop`, growing out of the selection whether the menu sits above or below it.
const POP_FROM_BELOW = MANTINE_TRANSITIONS.pop;
const POP_FROM_ABOVE = MANTINE_TRANSITIONS["pop-top-left"];
// Matches the PDF viewer's floating menu.
const MENU_GAP_PX = 8;
const TRANSITION_DURATION_MS = 150;

function usePointerInteractions() {
	const [isPointerDown, setIsPointerDown] = useState(false);
	const [isPointerReleased, setIsPointerReleased] = useState(true);

	useEffect(() => {
		const handlePointerUp = () => {
			setIsPointerDown(false);
			setIsPointerReleased(true);
			document.removeEventListener("pointerup", handlePointerUp);
			document.removeEventListener("pointercancel", handlePointerUp);
		};
		const handlePointerDown = () => {
			setIsPointerDown(true);
			setIsPointerReleased(false);
			document.addEventListener("pointerup", handlePointerUp);
			// On Android, dragging a native text-selection handle hijacks the
			// touch sequence and the browser fires pointercancel instead of
			// pointerup, so isPointerDown would otherwise get stuck true and
			// the floating menu would never be able to show.
			document.addEventListener("pointercancel", handlePointerUp);
		};
		document.addEventListener("pointerdown", handlePointerDown);
		return () =>
			document.removeEventListener("pointerdown", handlePointerDown);
	}, []);

	return { isPointerDown, isPointerReleased };
}

export function FloatingMenuPlugin({ buttons }: Props) {
	const [editor] = useLexicalComposerContext();
	const [coords, setCoords] = useState<{
		x: number;
		y: number;
		below: boolean;
	} | null>(null);
	const [activeState, setActiveState] = useState<Record<string, boolean>>({});
	const [visibleState, setVisibleState] = useState<Record<string, boolean>>(
		{},
	);
	const isEditorFocused = useIsEditorFocused();
	const [isMenuFocused, setIsMenuFocused] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const escapedRef = useRef(false);
	const { isPointerDown, isPointerReleased } = usePointerInteractions();
	const coarsePointer = useIsCoarsePointer();
	const theme = useMantineTheme();
	const reduceMotion = useReducedMotion() && theme.respectReducedMotion;

	// Bumped on every reposition or hide, so a stale async position can't reopen the menu.
	const positionRequestRef = useRef(0);

	const hideMenu = useCallback(() => {
		positionRequestRef.current++;
		setCoords(null);
	}, []);

	const calculatePosition = useCallback(() => {
		const menu = menuRef.current;
		const domSelection = getSelection();
		if (!menu || isPointerDown || !domSelection?.rangeCount) {
			hideMenu();
			return;
		}

		const range = domSelection.getRangeAt(0);
		const backward = isBackwardSelection(domSelection, range);
		const reference = {
			getBoundingClientRect: () => selectionEndRect(range, backward),
		};
		// Away from the rest of the selection so it isn't covered, except on touch, where the
		// menu stays above to clear the selection handles.
		const placement = backward || coarsePointer ? "top" : "bottom";
		const request = ++positionRequestRef.current;
		void computePosition(reference, menu, {
			placement,
			strategy: "absolute",
			middleware: [offset(MENU_GAP_PX), flip(), shift({ padding: 8 })],
		}).then(({ x, y, placement }) => {
			if (request !== positionRequestRef.current) return;
			setCoords({ x, y, below: placement.startsWith("bottom") });
		});
	}, [isPointerDown, coarsePointer, hideMenu]);

	const $handleSelectionChange = useCallback(() => {
		if (
			editor.isComposing() ||
			editor.getRootElement() !== document.activeElement
		) {
			hideMenu();
			return;
		}

		const selection = $getSelection();
		if (
			$isRangeSelection(selection) &&
			!selection.anchor.is(selection.focus)
		) {
			if (!escapedRef.current) calculatePosition();
		} else {
			escapedRef.current = false;
			hideMenu();
		}
	}, [editor, calculatePosition, hideMenu]);

	useEffect(() => {
		return editor.registerUpdateListener(({ editorState }) => {
			editorState.read(() => {
				$handleSelectionChange();

				const selection = $getSelection();
				if (!$isRangeSelection(selection)) return;

				const newActive: Record<string, boolean> = {};
				const newVisible: Record<string, boolean> = {};
				for (const btn of buttons) {
					if (isFloatingMenuDivider(btn)) continue;
					newActive[btn.name] = btn.isActive(selection);
					newVisible[btn.name] = btn.isVisible
						? btn.isVisible(selection)
						: true;
				}
				setActiveState(newActive);
				setVisibleState(newVisible);
			});
		});
	}, [editor, $handleSelectionChange, buttons]);

	useEffect(() => {
		if (coords === null && isPointerReleased) {
			editor.getEditorState().read(() => $handleSelectionChange());
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isPointerReleased, $handleSelectionChange, editor]);

	useEffect(() => {
		return editor.registerCommand(
			KEY_DOWN_COMMAND,
			e => {
				if (e.key === "Escape" && coords !== null) {
					e.stopPropagation();
					escapedRef.current = true;
					hideMenu();
					return true;
				}
				return false;
			},
			COMMAND_PRIORITY_LOW,
		);
	}, [editor, coords, hideMenu]);

	const closeMenu = useCallback(() => {
		escapedRef.current = true;
		hideMenu();
	}, [hideMenu]);

	useEffect(() => {
		return editor.registerCommand(
			KEY_DOWN_COMMAND,
			event => {
				const button = buttons.find(
					(btn): btn is FloatingMenuButton =>
						!isFloatingMenuDivider(btn) &&
						!!btn.shortcut &&
						matchesShortcut(btn.shortcut, event),
				);
				if (!button) return false;
				const isActive = editor.getEditorState().read(() => {
					const selection = $getSelection();
					if (!$isRangeSelection(selection)) return null;
					if (selection.isCollapsed() && !button.actsOnCaret)
						return null;
					if (button.isVisible && !button.isVisible(selection))
						return null;
					return button.isActive(selection);
				});
				if (isActive === null) return false;
				event.preventDefault();
				button.onClick(editor, isActive, closeMenu);
				return true;
			},
			COMMAND_PRIORITY_LOW,
		);
	}, [editor, buttons, closeMenu]);

	const shouldShow = (isEditorFocused || isMenuFocused) && coords !== null;
	const below = coords?.below ?? false;
	const pop = below ? POP_FROM_ABOVE : POP_FROM_BELOW;
	const popState = shouldShow ? pop.in : pop.out;

	const items: FloatingMenuBarItem[] = buttons.map(btn => {
		if (isFloatingMenuDivider(btn)) return btn;
		return {
			name: btn.name,
			title: btn.title,
			label: btn.label,
			showLabel: btn.showLabel,
			color: btn.color,
			Icon: btn.Icon,
			shortcut: btn.shortcut,
			isActive: activeState[btn.name] ?? false,
			isVisible: visibleState[btn.name] ?? true,
			onClick: () =>
				btn.onClick(editor, activeState[btn.name] ?? false, closeMenu),
		};
	});

	return (
		<FloatingMenuBar
			ref={menuRef}
			items={items}
			className={styles["floating-menu"]}
			style={{
				top: coords?.y ?? 0,
				left: coords?.x ?? 0,
				transform: popState.transform,
				transformOrigin: below ? "top center" : "bottom center",
				opacity: popState.opacity,
				// Stays mounted (it's measured to be positioned), so it animates rather than `<Transition>`.
				// `visibility` flips at the end on hide and at once on show, letting the fade play out.
				visibility: shouldShow ? "visible" : "hidden",
				transitionProperty: "opacity, transform, visibility",
				transitionDuration: `${reduceMotion ? 0 : TRANSITION_DURATION_MS}ms`,
				transitionTimingFunction: "ease",
				pointerEvents: shouldShow ? "auto" : "none",
			}}
			onFocus={() => setIsMenuFocused(true)}
			onBlur={() => setIsMenuFocused(false)}
			onKeyDown={(e: React.KeyboardEvent) => {
				if (e.key === "Escape") {
					hideMenu();
					editor.focus();
				}
			}}
		/>
	);
}
