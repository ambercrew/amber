import {
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
	$getSelection,
	$isRangeSelection,
	BLUR_COMMAND,
	COMMAND_PRIORITY_LOW,
	FOCUS_COMMAND,
	KEY_DOWN_COMMAND,
	LexicalEditor,
	RangeSelection,
} from "lexical";
import {
	ActionIcon,
	Button,
	Divider,
	Group,
	MantineColor,
	Paper,
} from "@mantine/core";
import styles from "../Editor.module.css";
import AppTooltip from "../../AppTooltip/AppTooltip";

export interface FloatingMenuButton {
	divider?: false;
	name: string;
	title: string;
	label?: string;
	showLabel?: boolean;
	color?: MantineColor;
	Icon: React.ComponentType<{ size?: number }>;
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
	const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
	const [activeState, setActiveState] = useState<Record<string, boolean>>({});
	const [visibleState, setVisibleState] = useState<Record<string, boolean>>(
		{},
	);
	const subscribeToFocus = useCallback(
		(onStoreChange: () => void) => {
			const unregisterBlur = editor.registerCommand(
				BLUR_COMMAND,
				() => {
					onStoreChange();
					return false;
				},
				COMMAND_PRIORITY_LOW,
			);
			const unregisterFocus = editor.registerCommand(
				FOCUS_COMMAND,
				() => {
					onStoreChange();
					return false;
				},
				COMMAND_PRIORITY_LOW,
			);
			return () => {
				unregisterBlur();
				unregisterFocus();
			};
		},
		[editor],
	);
	const getFocusSnapshot = useCallback(
		() => editor.getRootElement() === document.activeElement,
		[editor],
	);
	// Extensions like AutoFocus can focus the root element (and fire
	// FOCUS_COMMAND) synchronously while the editor is being built, before
	// this subscription is registered. useSyncExternalStore re-checks the
	// snapshot right after commit, so that initial case isn't missed.
	const isEditorFocused = useSyncExternalStore(
		subscribeToFocus,
		getFocusSnapshot,
	);
	const [isMenuFocused, setIsMenuFocused] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const escapedRef = useRef(false);
	const { isPointerDown, isPointerReleased } = usePointerInteractions();

	const calculatePosition = useCallback(() => {
		const domSelection = getSelection();
		const originalRange =
			domSelection?.rangeCount !== 0 ? domSelection?.getRangeAt(0) : null;
		const domRange = originalRange?.cloneRange();
		domRange?.collapse(domSelection?.direction === "backward");
		let domRangeRect = domRange?.getBoundingClientRect();

		if (domRangeRect?.width === 0 && domRangeRect?.height === 0) {
			domRangeRect = originalRange?.getBoundingClientRect();
		}

		const editorRect = editor.getRootElement()?.getBoundingClientRect();
		if (!domRangeRect || isPointerDown || !editorRect) {
			return setCoords(null);
		}

		if (coords) return;

		requestAnimationFrame(() => {
			const menuRect = menuRef.current?.getBoundingClientRect();
			if (!menuRect) return;

			let x = Math.max(
				0,
				domRangeRect.left - editorRect.left - menuRect.width / 2,
			);
			if (x + menuRect.width > editorRect.width) {
				x = editorRect.width - menuRect.width;
			}

			setCoords({
				x,
				y: domRangeRect.top - editorRect.top - 10,
			});
		});
	}, [editor, isPointerDown, coords]);

	const $handleSelectionChange = useCallback(() => {
		if (
			editor.isComposing() ||
			editor.getRootElement() !== document.activeElement
		) {
			setCoords(null);
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
			setCoords(null);
		}
	}, [editor, calculatePosition]);

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
					setCoords(null);
					return true;
				}
				return false;
			},
			COMMAND_PRIORITY_LOW,
		);
	}, [editor, coords]);

	const closeMenu = useCallback(() => {
		escapedRef.current = true;
		setCoords(null);
	}, []);

	const shouldShow = (isEditorFocused || isMenuFocused) && coords !== null;

	// Only render a divider when it has a visible button on both sides,
	// otherwise it would dangle at the start/end or next to another divider.
	const candidates = buttons.filter(
		item =>
			isFloatingMenuDivider(item) || visibleState[item.name] !== false,
	);
	const visibleItems = candidates.filter((item, index) => {
		if (!isFloatingMenuDivider(item)) return true;
		const prev = candidates[index - 1];
		const next = candidates[index + 1];
		return (
			!!prev &&
			!!next &&
			!isFloatingMenuDivider(prev) &&
			!isFloatingMenuDivider(next)
		);
	});

	return (
		<Paper
			ref={menuRef}
			withBorder
			shadow="md"
			p={4}
			className={styles["floating-menu"]}
			style={{
				top: coords?.y ?? 0,
				left: coords?.x ?? 0,
				transform: "translateY(-100%)",
				visibility: shouldShow ? "visible" : "hidden",
				opacity: shouldShow ? 1 : 0,
				pointerEvents: shouldShow ? "auto" : "none",
			}}
			onFocus={() => setIsMenuFocused(true)}
			onBlur={() => setIsMenuFocused(false)}
			onKeyDown={(e: React.KeyboardEvent) => {
				if (e.key === "Escape") {
					setCoords(null);
					editor.focus();
				}
			}}>
			<Group gap={2}>
				{visibleItems.map(btn =>
					isFloatingMenuDivider(btn) ? (
						<Divider key={btn.name} mx={4} orientation="vertical" />
					) : btn.showLabel ? (
						<AppTooltip key={btn.name} label={btn.title}>
							<Button
								variant={
									activeState[btn.name] ? "filled" : "subtle"
								}
								color={btn.color}
								size="sm"
								px="xs"
								leftSection={<btn.Icon size={22} />}
								aria-label={btn.title}
								onMouseDown={(e: React.MouseEvent) =>
									e.preventDefault()
								}
								onClick={() =>
									btn.onClick(
										editor,
										activeState[btn.name] ?? false,
										closeMenu,
									)
								}>
								{btn.label ?? btn.title}
							</Button>
						</AppTooltip>
					) : (
						<AppTooltip key={btn.name} label={btn.title}>
							<ActionIcon
								variant={
									activeState[btn.name] ? "filled" : "subtle"
								}
								color={btn.color}
								size="lg"
								aria-label={btn.title}
								onMouseDown={(e: React.MouseEvent) =>
									e.preventDefault()
								}
								onClick={() =>
									btn.onClick(
										editor,
										activeState[btn.name] ?? false,
										closeMenu,
									)
								}>
								<btn.Icon size={22} />
							</ActionIcon>
						</AppTooltip>
					),
				)}
			</Group>
		</Paper>
	);
}
