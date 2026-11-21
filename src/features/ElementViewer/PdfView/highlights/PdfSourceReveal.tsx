import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { readSpotNavigationState } from "../../../../types/elements/spotNavigationState";
import { usePdfCore } from "../core/pdfCoreContext";
import { usePdfHighlights } from "./pdfHighlightsContext";

/** Jumps to the page of the highlight an opening asks for, once it has loaded and the layout is ready. */
export default function PdfSourceReveal() {
	const { layoutReady, goToPage } = usePdfCore();
	const { highlights } = usePdfHighlights();
	const location = useLocation();
	const { revealHighlightOf } = readSpotNavigationState(location.state);
	const revealedKeyRef = useRef<string | null>(null);

	useEffect(() => {
		if (!revealHighlightOf || !layoutReady) return;
		if (revealedKeyRef.current === location.key) return;
		const pages = highlights
			.filter(({ custom }) => custom.elementId === revealHighlightOf)
			.map(({ pageIndex }) => pageIndex);
		// Waits while none matches, as the saved highlights may still be loading.
		if (pages.length === 0) return;
		// A frame later, so the read point restore on the same layout (a parent's effect, run after this) doesn't override it.
		const page = Math.min(...pages) + 1;
		const frame = requestAnimationFrame(() => {
			revealedKeyRef.current = location.key;
			goToPage(page);
		});
		return () => cancelAnimationFrame(frame);
	}, [goToPage, highlights, layoutReady, location.key, revealHighlightOf]);

	return null;
}
