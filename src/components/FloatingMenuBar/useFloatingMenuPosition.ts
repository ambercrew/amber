import { useCallback, useEffect, useRef, useState } from "react";
import {
	autoUpdate,
	computePosition,
	flip,
	hide,
	limitShift,
	offset,
	shift,
	type Boundary,
	type Placement,
	type ReferenceElement,
	type Strategy,
} from "@floating-ui/dom";
import { useVisibleAreaElement } from "./visibleAreaContext";

const MENU_GAP_PX = 8;
const EDGE_PADDING_PX = 8;

interface FloatingMenuPositionOptions {
	open: boolean;
	floating: HTMLElement | null;
	reference: ReferenceElement | null;
	placement: Placement;
	strategy?: Strategy;
}

export interface FloatingMenuPosition {
	/** Whether it sits below its reference, so it grows downward. */
	below: boolean;
	/** Whether it was placed since it opened, so it never shows where it last was. */
	placed: boolean;
	/** Whether its reference is out of view, e.g. scrolled behind the header, so it hides too. */
	referenceHidden: boolean;
	/** Places it again now, for a reference that moved without a scroll or resize. */
	update: () => void;
}

function contextElementOf(reference: ReferenceElement): Element | undefined {
	return reference instanceof Element ? reference : reference.contextElement;
}

/**
 * Keeps an open floating menu beside its reference as the page scrolls, flipping it to the other
 * side when it would go out of view or behind the header or footer.
 */
export function useFloatingMenuPosition({
	open,
	floating,
	reference,
	placement,
	strategy = "absolute",
}: FloatingMenuPositionOptions): FloatingMenuPosition {
	const visibleAreaElement = useVisibleAreaElement();
	// Rests in the plain pop (above) until first placed, as it's hidden until then anyway.
	const [{ below, placed, referenceHidden }, setPlacedSide] = useState({
		below: false,
		placed: false,
		referenceHidden: false,
	});
	const [trackedOpen, setTrackedOpen] = useState(open);
	const updateRef = useRef<(() => void) | null>(null);

	if (open !== trackedOpen) {
		setTrackedOpen(open);
		if (!open) setPlacedSide(side => ({ ...side, placed: false }));
	}

	useEffect(() => {
		if (!open || !floating || !reference) return;

		const contextElement = contextElementOf(reference);
		// Only the main content area, which holds the visible-area element, has a header and footer over it.
		const boundary: Boundary = visibleAreaElement?.parentElement?.contains(
			contextElement ?? null,
		)
			? visibleAreaElement
			: "clippingAncestors";
		let active = true;
		// What was last put in state; only a change sets it again, so scrolling doesn't render.
		let reported: string | null = null;
		const update = () => {
			void computePosition(reference, floating, {
				placement,
				strategy,
				middleware: [
					offset(MENU_GAP_PX),
					flip({ boundary, padding: EDGE_PADDING_PX }),
					// Over a reference taller than the view, it follows the reference's visible part.
					shift({
						boundary,
						padding: EDGE_PADDING_PX,
						crossAxis: true,
						limiter: limitShift(),
					}),
					hide({ boundary }),
				],
			}).then(({ x, y, placement: placedAt, middlewareData }) => {
				if (!active) return;
				// Written to the element rather than state, so scrolling doesn't re-render the menu.
				floating.style.left = `${x}px`;
				floating.style.top = `${y}px`;
				const side = {
					below: placedAt.startsWith("bottom"),
					placed: true,
					referenceHidden: !!middlewareData.hide?.referenceHidden,
				};
				const key = `${side.below}:${side.referenceHidden}`;
				if (key === reported) return;
				reported = key;
				setPlacedSide(side);
			});
		};
		updateRef.current = update;
		const stop = autoUpdate(reference, floating, update);
		return () => {
			active = false;
			updateRef.current = null;
			stop();
		};
	}, [open, floating, reference, placement, strategy, visibleAreaElement]);

	const update = useCallback(() => updateRef.current?.(), []);
	return { below, placed, referenceHidden, update };
}
