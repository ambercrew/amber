import { TreeDragDropPayload, TreeNodeData } from "@mantine/core";
import { useCallback, useEffect, useRef } from "react";
import { DropPosition } from "../../../api/elements/api/elementsApi";
import { isLinux } from "../../../utils/tauriUtils";
import { getAncestorsOf } from "../utils/elementTreeUtils";

export const MOVE_THRESHOLD_PX = 5;
export const LONG_PRESS_MS = 400;
export const LONG_PRESS_TOLERANCE_PX = 8;
export const AUTOSCROLL_EDGE_PX = 40;
export const AUTOSCROLL_STEP_PX = 12;

const LABEL_SELECTOR = "[data-tree-label]";
const NON_DRAGGABLE_SELECTOR =
	"button, input, textarea, select, [data-no-drag]";

/**
 * Native HTML5 drag never starts under the Linux CEF backend; Android touch
 * has the same limitation — include it here when touch reorder is needed there.
 */
export function shouldUsePointerDragAndDrop(): boolean {
	return isLinux();
}

/** Mirrors Mantine's own drop-zone algorithm so the indicators behave identically. */
export function getDropPosition(
	clientY: number,
	rect: { top: number; height: number },
	hasChildren: boolean,
	expanded: boolean,
): DropPosition {
	const y = clientY - rect.top;
	const height = rect.height;
	if (hasChildren) {
		if (expanded) {
			if (y < height * 0.5) return "before";
			return "inside";
		}
		if (y < height * 0.25) return "before";
		if (y > height * 0.75) return "after";
		return "inside";
	}
	if (y < height * 0.5) return "before";
	return "after";
}

/** False for the dragged node itself and for any of its descendants. */
export function isValidDropTarget(
	data: TreeNodeData[],
	draggedValue: string,
	targetValue: string,
): boolean {
	if (!targetValue || draggedValue === targetValue) return false;
	const ancestors = getAncestorsOf(data, targetValue);
	return !(ancestors?.includes(draggedValue) ?? false);
}

interface DragState {
	draggedValue: string;
	sourceLabel: HTMLElement;
	active: boolean;
	startX: number;
	startY: number;
	pointerType: string;
	pressTimer: ReturnType<typeof setTimeout> | null;
	dropTarget: HTMLElement | null;
	dropPosition: DropPosition | null;
}

interface DragListeners {
	onPointerMove: (event: PointerEvent) => void;
	onPointerUp: (event: PointerEvent) => void;
	onPointerCancel: (event: PointerEvent) => void;
	onContextMenu: (event: Event) => void;
	onKeyDown: (event: KeyboardEvent) => void;
	onBlur: () => void;
}

function activateDrag(state: DragState) {
	state.active = true;
	state.sourceLabel.setAttribute("data-dragging", "true");
	document.body.style.userSelect = "none";
	document.body.style.cursor = "grabbing";
}

function clearDropTarget(state: DragState) {
	state.dropTarget?.removeAttribute("data-drag-over");
	state.dropTarget = null;
	state.dropPosition = null;
}

function teardownDrag(state: DragState, listeners: DragListeners) {
	if (state.pressTimer !== null) clearTimeout(state.pressTimer);
	document.removeEventListener("pointermove", listeners.onPointerMove);
	document.removeEventListener("pointerup", listeners.onPointerUp);
	document.removeEventListener("pointercancel", listeners.onPointerCancel);
	document.removeEventListener("contextmenu", listeners.onContextMenu);
	window.removeEventListener("keydown", listeners.onKeyDown);
	window.removeEventListener("blur", listeners.onBlur);
	state.sourceLabel.removeAttribute("data-dragging");
	clearDropTarget(state);
	document.body.style.removeProperty("user-select");
	document.body.style.removeProperty("cursor");
}

function findScrollParent(element: HTMLElement): HTMLElement | null {
	let current = element.parentElement;
	while (current) {
		const overflowY = getComputedStyle(current).overflowY;
		if (
			/(auto|scroll)/.test(overflowY) &&
			current.scrollHeight > current.clientHeight
		) {
			return current;
		}
		current = current.parentElement;
	}
	return null;
}

function autoScroll(clientY: number, sourceLabel: HTMLElement) {
	const scrollParent = findScrollParent(sourceLabel);
	if (!scrollParent) return;
	const rect = scrollParent.getBoundingClientRect();
	if (clientY < rect.top + AUTOSCROLL_EDGE_PX) {
		scrollParent.scrollTop -= AUTOSCROLL_STEP_PX;
	} else if (clientY > rect.bottom - AUTOSCROLL_EDGE_PX) {
		scrollParent.scrollTop += AUTOSCROLL_STEP_PX;
	}
}

function updateDropTarget(
	clientX: number,
	clientY: number,
	state: DragState,
	data: TreeNodeData[],
) {
	let label: HTMLElement | null = null;
	for (const element of document.elementsFromPoint(clientX, clientY)) {
		const candidate = element.closest<HTMLElement>(LABEL_SELECTOR);
		if (candidate) {
			label = candidate;
			break;
		}
	}

	const targetValue = label?.dataset.value ?? "";
	if (!label || !isValidDropTarget(data, state.draggedValue, targetValue)) {
		clearDropTarget(state);
		return;
	}

	const position = getDropPosition(
		clientY,
		label.getBoundingClientRect(),
		label.dataset.hasChildren === "true",
		label.dataset.expanded === "true",
	);
	if (state.dropTarget !== label) {
		state.dropTarget?.removeAttribute("data-drag-over");
		state.dropTarget = label;
	}
	state.dropPosition = position;
	label.setAttribute("data-drag-over", position);
}

interface UseElementTreeDragAndDropOptions {
	data: TreeNodeData[];
	onDrop: (
		draggedValue: string,
		targetValue: string,
		position: DropPosition,
	) => void;
}

/**
 * Drag-and-drop props for Mantine's Tree. Native HTML5 drag never starts under
 * the Linux CEF backend, so Linux drives reordering with pointer events while
 * every other platform delegates to Mantine's native `onDragDrop`.
 */
export function useElementTreeDragAndDrop({
	data,
	onDrop,
}: UseElementTreeDragAndDropOptions) {
	const dataRef = useRef(data);
	const onDropRef = useRef(onDrop);
	useEffect(() => {
		dataRef.current = data;
		onDropRef.current = onDrop;
	}, [data, onDrop]);

	const dragRef = useRef<DragState | null>(null);
	const suppressClickRef = useRef(false);

	const handlePointerDown = useCallback(
		(event: React.PointerEvent<HTMLUListElement>) => {
			suppressClickRef.current = false;
			if (event.button !== 0 || event.isPrimary === false) return;
			if (dragRef.current) return;

			const target = event.target as Element;
			const label = target.closest<HTMLElement>(LABEL_SELECTOR);
			if (!label) return;
			if (target.closest(NON_DRAGGABLE_SELECTOR)) return;
			const draggedValue = label.dataset.value;
			if (!draggedValue) return;

			const state: DragState = {
				draggedValue,
				sourceLabel: label,
				active: false,
				startX: event.clientX,
				startY: event.clientY,
				pointerType: event.pointerType,
				pressTimer: null,
				dropTarget: null,
				dropPosition: null,
			};

			function endDrag() {
				teardownDrag(state, listeners);
				if (dragRef.current === state) dragRef.current = null;
			}

			const listeners: DragListeners = {
				onPointerMove: moveEvent => {
					if (dragRef.current !== state) return;
					const distance = Math.hypot(
						moveEvent.clientX - state.startX,
						moveEvent.clientY - state.startY,
					);

					if (!state.active) {
						if (state.pointerType === "touch") {
							// Any scroll/movement before the long press fires cancels it.
							if (distance > LONG_PRESS_TOLERANCE_PX) endDrag();
							return;
						}
						if (distance <= MOVE_THRESHOLD_PX) return;
						if (state.pressTimer !== null) {
							clearTimeout(state.pressTimer);
							state.pressTimer = null;
						}
						activateDrag(state);
					}

					moveEvent.preventDefault();
					autoScroll(moveEvent.clientY, state.sourceLabel);
					updateDropTarget(
						moveEvent.clientX,
						moveEvent.clientY,
						state,
						dataRef.current,
					);
				},
				onPointerUp: () => {
					if (dragRef.current !== state) return;
					const { active, dropTarget, dropPosition } = state;
					const targetValue = dropTarget?.dataset.value;
					if (active && targetValue && dropPosition) {
						onDropRef.current(
							state.draggedValue,
							targetValue,
							dropPosition,
						);
					}
					if (active) suppressClickRef.current = true;
					endDrag();
				},
				onPointerCancel: () => {
					if (dragRef.current === state) endDrag();
				},
				onContextMenu: contextEvent => {
					if (state.active) contextEvent.preventDefault();
				},
				onKeyDown: keyEvent => {
					if (keyEvent.key === "Escape") endDrag();
				},
				onBlur: () => endDrag(),
			};

			dragRef.current = state;

			if (event.pointerType === "touch") {
				state.pressTimer = setTimeout(() => {
					if (dragRef.current !== state) return;
					state.pressTimer = null;
					activateDrag(state);
				}, LONG_PRESS_MS);
			}

			document.addEventListener("pointermove", listeners.onPointerMove);
			document.addEventListener("pointerup", listeners.onPointerUp);
			document.addEventListener(
				"pointercancel",
				listeners.onPointerCancel,
			);
			document.addEventListener("contextmenu", listeners.onContextMenu);
			window.addEventListener("keydown", listeners.onKeyDown);
			window.addEventListener("blur", listeners.onBlur);
		},
		[],
	);

	const handleClickCapture = useCallback((event: React.MouseEvent) => {
		if (!suppressClickRef.current) return;
		suppressClickRef.current = false;
		event.preventDefault();
		event.stopPropagation();
	}, []);

	if (!shouldUsePointerDragAndDrop()) {
		return {
			onDragDrop: ({
				draggedNode,
				targetNode,
				position,
			}: TreeDragDropPayload) =>
				onDropRef.current(draggedNode, targetNode, position),
		};
	}

	return {
		onPointerDown: handlePointerDown,
		onClickCapture: handleClickCapture,
	};
}
