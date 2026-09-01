import { useEffect, useState } from "react";
import {
	searchHighlightRegistry,
	supportsHighlightApi,
} from "./searchHighlightRegistry";
import styles from "./SearchHighlightOverlay.module.css";

interface Box {
	top: number;
	left: number;
	width: number;
	height: number;
	current: boolean;
}

/** The clipping ancestors of a range, so boxes never paint outside a scroll container. */
function clippingAncestors(element: Element): Element[] {
	const ancestors: Element[] = [];
	for (
		let node: Element | null = element;
		node && node !== document.body;
		node = node.parentElement
	) {
		const { overflowX, overflowY } = getComputedStyle(node);
		if (overflowX !== "visible" || overflowY !== "visible")
			ancestors.push(node);
	}
	return ancestors;
}

function rangeElement(range: Range): Element | null {
	const node = range.commonAncestorContainer;
	return node instanceof Element ? node : node.parentElement;
}

function sameBoxes(a: Box[], b: Box[]): boolean {
	return (
		a.length === b.length &&
		a.every((box, index) => {
			const other = b[index];
			return (
				box.top === other.top &&
				box.left === other.left &&
				box.width === other.width &&
				box.height === other.height &&
				box.current === other.current
			);
		})
	);
}

/**
 * Fallback renderer for browsers without the CSS Custom Highlight API
 * (notably some Android system WebViews and Windows machines on an
 * outdated WebView2 runtime) — paints the same ranges as absolutely
 * positioned boxes instead of relying on `::highlight()`.
 */
export default function SearchHighlightOverlay() {
	const [boxes, setBoxes] = useState<Box[]>([]);

	useEffect(() => {
		if (supportsHighlightApi()) return;

		let raf = 0;
		let previous: Box[] = [];
		let listening = false;
		/** Clipping ancestors per range container, rebuilt whenever the ranges change. */
		const clipCache = new Map<Element, Element[]>();

		const computeBoxes = (ranges: Range[]): Box[] => {
			const currentRange = searchHighlightRegistry.getCurrentRange();
			const next: Box[] = [];
			for (const range of ranges) {
				const current = range === currentRange;
				const element = rangeElement(range);
				const clips = element ? (clipCache.get(element) ?? []) : [];
				const clipRects = clips.map(clip =>
					clip.getBoundingClientRect(),
				);
				for (const rect of range.getClientRects()) {
					let { top, left } = rect;
					let right = rect.right;
					let bottom = rect.bottom;
					for (const clip of clipRects) {
						top = Math.max(top, clip.top);
						left = Math.max(left, clip.left);
						right = Math.min(right, clip.right);
						bottom = Math.min(bottom, clip.bottom);
					}
					if (right <= left || bottom <= top) continue;
					next.push({
						top,
						left,
						width: right - left,
						height: bottom - top,
						current,
					});
				}
			}
			return next;
		};

		const recompute = () => {
			const next = computeBoxes(
				searchHighlightRegistry.getAllRangesFlat(),
			);
			if (sameBoxes(previous, next)) return;
			previous = next;
			setBoxes(next);
		};

		const schedule = () => {
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(recompute);
		};

		// Content can move without a scroll or resize event — a sidebar
		// toggling, an image or code block finishing layout, the soft keyboard
		// reflowing the page — so watch the containers the ranges live in.
		const observer =
			typeof ResizeObserver === "undefined"
				? null
				: new ResizeObserver(schedule);

		const setListening = (active: boolean) => {
			if (active === listening) return;
			listening = active;
			const scrollOptions = { capture: true, passive: true } as const;
			const viewport = window.visualViewport;
			if (active) {
				window.addEventListener("scroll", schedule, scrollOptions);
				window.addEventListener("resize", schedule);
				viewport?.addEventListener("scroll", schedule);
				viewport?.addEventListener("resize", schedule);
			} else {
				window.removeEventListener("scroll", schedule, scrollOptions);
				window.removeEventListener("resize", schedule);
				viewport?.removeEventListener("scroll", schedule);
				viewport?.removeEventListener("resize", schedule);
			}
		};

		const onRangesChanged = () => {
			const ranges = searchHighlightRegistry.getAllRangesFlat();

			clipCache.clear();
			observer?.disconnect();
			for (const range of ranges) {
				const element = rangeElement(range);
				if (!element || clipCache.has(element)) continue;
				clipCache.set(element, clippingAncestors(element));
				observer?.observe(element);
				const editorRoot = element.closest('[contenteditable="true"]');
				if (editorRoot) observer?.observe(editorRoot);
			}

			// Nothing to paint means nothing to keep in sync — stay idle so
			// scrolling costs nothing while no search is running.
			setListening(ranges.length > 0);
			recompute();
		};

		onRangesChanged();
		const unsubscribe = searchHighlightRegistry.subscribe(onRangesChanged);

		return () => {
			unsubscribe();
			cancelAnimationFrame(raf);
			setListening(false);
			observer?.disconnect();
		};
	}, []);

	if (supportsHighlightApi() || boxes.length === 0) return null;

	return (
		<div
			aria-hidden
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 150,
				pointerEvents: "none",
			}}>
			{boxes.map((box, index) => (
				<div
					key={index}
					className={`${styles.box} ${box.current ? styles.current : styles.all}`}
					style={{
						top: box.top,
						left: box.left,
						width: box.width,
						height: box.height,
					}}
				/>
			))}
		</div>
	);
}
