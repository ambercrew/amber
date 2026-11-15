import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SEARCH_HIGHLIGHT_HOST_ATTRIBUTE } from "./searchHighlightHost";
import { searchHighlightRegistry } from "./searchHighlightRegistry";
import styles from "./SearchHighlightOverlay.module.css";

interface Box {
	top: number;
	left: number;
	width: number;
	height: number;
	current: boolean;
}

/** Boxes painted together: inside `host`'s layer, or fixed to the viewport when `host` is null. */
interface BoxGroup {
	host: HTMLElement | null;
	layer: HTMLElement | null;
	boxes: Box[];
}

interface RangeInfo {
	host: HTMLElement | null;
	/** Ancestors between the range and its host that clip it, e.g. a code block scrolling sideways. */
	clips: Element[];
}

function rangeElement(range: Range): Element | null {
	const node = range.commonAncestorContainer;
	return node instanceof Element ? node : node.parentElement;
}

function rangeInfo(element: Element): RangeInfo {
	const clips: Element[] = [];
	for (
		let node: Element | null = element;
		node && node !== document.body;
		node = node.parentElement
	) {
		if (
			node instanceof HTMLElement &&
			node.hasAttribute(SEARCH_HIGHLIGHT_HOST_ATTRIBUTE)
		)
			return { host: node, clips };
		const { overflowX, overflowY } = getComputedStyle(node);
		if (overflowX !== "visible" || overflowY !== "visible")
			clips.push(node);
	}
	return { host: null, clips };
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

function sameGroups(a: BoxGroup[], b: BoxGroup[]): boolean {
	return (
		a.length === b.length &&
		a.every(
			(group, index) =>
				group.host === b[index].host &&
				group.layer === b[index].layer &&
				sameBoxes(group.boxes, b[index].boxes),
		)
	);
}

function boxClassName(box: Box) {
	return `${styles.box} ${box.current ? styles.current : styles.all}`;
}

/**
 * Paints find-in-page matches as boxes over the text. Used instead of the CSS
 * Custom Highlight API, which some Android WebViews and outdated WebView2
 * runtimes lack. Inside a host the boxes sit in a layer in the scrolled
 * content, so scrolling moves them with the text and needs no repainting here.
 */
export default function SearchHighlightOverlay() {
	const [groups, setGroups] = useState<BoxGroup[]>([]);

	useEffect(() => {
		let raf = 0;
		let previous: BoxGroup[] = [];
		const infoCache = new Map<Element, RangeInfo>();
		/** Scrolling these moves matches relative to their layer, so it re-measures. */
		let watchedScrollers = new Set<EventTarget>();
		let hasFixedRanges = false;
		/** One zero-height layer per host, kept in the host's flow so it scrolls with its content. */
		const layers = new Map<HTMLElement, HTMLElement>();
		let listening = false;

		const layerFor = (host: HTMLElement) => {
			let layer = layers.get(host);
			if (layer?.parentElement !== host) {
				layer = document.createElement("div");
				layer.className = styles.scrollLayer;
				layer.setAttribute("aria-hidden", "true");
				host.appendChild(layer);
				layers.set(host, layer);
			}
			return layer;
		};

		const removeUnusedLayers = (usedHosts: Set<HTMLElement>) => {
			for (const [host, layer] of layers) {
				if (usedHosts.has(host)) continue;
				layer.remove();
				layers.delete(host);
			}
		};

		const computeGroups = (ranges: Range[]): BoxGroup[] => {
			const currentRange = searchHighlightRegistry.getCurrentRange();
			const byHost = new Map<HTMLElement | null, BoxGroup>();
			const originCache = new Map<HTMLElement, DOMRect>();

			for (const range of ranges) {
				const element = rangeElement(range);
				const info = element ? infoCache.get(element) : undefined;
				if (!info) continue;
				const { host, clips } = info;

				let group = byHost.get(host);
				if (!group) {
					group = {
						host,
						layer: host ? layerFor(host) : null,
						boxes: [],
					};
					byHost.set(host, group);
				}
				// Boxes in a host are placed relative to its layer; fixed ones to the viewport.
				let originTop = 0;
				let originLeft = 0;
				if (group.layer && host) {
					let origin = originCache.get(host);
					if (!origin) {
						origin = group.layer.getBoundingClientRect();
						originCache.set(host, origin);
					}
					originTop = origin.top;
					originLeft = origin.left;
				}

				const clipRects = clips.map(clip =>
					clip.getBoundingClientRect(),
				);
				const current = range === currentRange;
				for (const rect of range.getClientRects()) {
					let { top, left, right, bottom } = rect;
					for (const clip of clipRects) {
						top = Math.max(top, clip.top);
						left = Math.max(left, clip.left);
						right = Math.min(right, clip.right);
						bottom = Math.min(bottom, clip.bottom);
					}
					if (right <= left || bottom <= top) continue;
					group.boxes.push({
						top: top - originTop,
						left: left - originLeft,
						width: right - left,
						height: bottom - top,
						current,
					});
				}
			}

			removeUnusedLayers(
				new Set(
					[...byHost.keys()].filter(
						(host): host is HTMLElement => host !== null,
					),
				),
			);
			return [...byHost.values()];
		};

		const recompute = () => {
			const next = computeGroups(
				searchHighlightRegistry.getAllRangesFlat(),
			);
			if (sameGroups(previous, next)) return;
			previous = next;
			setGroups(next);
		};

		const schedule = () => {
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(recompute);
		};

		// A host's own scrolling moves its boxes natively; only fixed boxes and inner clips need it.
		const onScroll = (event: Event) => {
			if (hasFixedRanges || watchedScrollers.has(event.target ?? window))
				schedule();
		};

		// Content can move without a scroll event — a sidebar toggling, a split
		// mounting above, an image finishing layout — so watch what it lives in.
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
				window.addEventListener("scroll", onScroll, scrollOptions);
				// Re-measures once a scroll settles, should anything have shifted unobserved.
				window.addEventListener("scrollend", schedule, scrollOptions);
				window.addEventListener("resize", schedule);
				viewport?.addEventListener("scroll", onScroll);
				viewport?.addEventListener("resize", schedule);
			} else {
				window.removeEventListener("scroll", onScroll, scrollOptions);
				window.removeEventListener(
					"scrollend",
					schedule,
					scrollOptions,
				);
				window.removeEventListener("resize", schedule);
				viewport?.removeEventListener("scroll", onScroll);
				viewport?.removeEventListener("resize", schedule);
			}
		};

		const onRangesChanged = () => {
			const ranges = searchHighlightRegistry.getAllRangesFlat();

			infoCache.clear();
			observer?.disconnect();
			watchedScrollers = new Set();
			hasFixedRanges = false;
			const observedHosts = new Set<HTMLElement>();
			for (const range of ranges) {
				const element = rangeElement(range);
				if (!element || infoCache.has(element)) continue;
				const info = rangeInfo(element);
				infoCache.set(element, info);
				info.clips.forEach(clip => watchedScrollers.add(clip));
				if (!info.host) hasFixedRanges = true;
				else if (!observedHosts.has(info.host)) {
					observedHosts.add(info.host);
					const content = info.host.firstElementChild;
					if (content) observer?.observe(content);
				}
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
			removeUnusedLayers(new Set());
		};
	}, []);

	return groups.map(({ host, layer, boxes }) => {
		if (boxes.length === 0) return null;
		const rendered = boxes.map((box, index) => (
			<div
				key={index}
				className={boxClassName(box)}
				style={{
					position: layer ? "absolute" : "fixed",
					top: box.top,
					left: box.left,
					width: box.width,
					height: box.height,
				}}
			/>
		));
		return layer ? (
			createPortal(rendered, layer, `host-${groupKey(host)}`)
		) : (
			<div key="fixed" aria-hidden className={styles.layer}>
				{rendered}
			</div>
		);
	});
}

const hostKeys = new WeakMap<HTMLElement, number>();
let nextHostKey = 0;

/** A stable key per host element, for rendering each host's portal. */
function groupKey(host: HTMLElement | null): number {
	if (!host) return -1;
	let key = hostKeys.get(host);
	if (key === undefined) {
		key = nextHostKey++;
		hostKeys.set(host, key);
	}
	return key;
}
