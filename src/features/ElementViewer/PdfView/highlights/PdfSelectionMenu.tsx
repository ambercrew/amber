import { useCallback } from "react";
import { Anchored } from "@embedpdf/react/anchored";
import { useSelector } from "@embedpdf/react/runtime";
import {
	SelectionCapability,
	SelectionToken,
	useSelectionState,
} from "@embedpdf/react/selection";
import { useRecordExtractReadPoint } from "../../readPoint/readPointContext";
import { usePdfCore } from "../core/pdfCoreContext";
import PdfFloatingMenu from "./PdfFloatingMenu";
import { PdfHighlightRemoval } from "./usePdfHighlightRemoval";

// The gap between the selection and the menu.
const MENU_GAP_PX = 8;

/** Where the drag let go: the selection's end, or its start for a backward drag. */
interface PdfMenuEndpoint {
	above: boolean;
	page: { kind: "objectNumber"; objectNumber: number };
	rect: { x: number; y: number; width: number; height: number };
}

function menuEndpointOf(
	selection: SelectionCapability,
): PdfMenuEndpoint | null {
	const snapshot = selection.getSnapshot();
	const above = snapshot.direction === "backward";
	const endpoint = above ? snapshot.start : snapshot.end;
	return endpoint
		? { above, page: endpoint.page, rect: endpoint.rect }
		: null;
}

function sameEndpoint(a: PdfMenuEndpoint | null, b: PdfMenuEndpoint | null) {
	if (!a || !b) return a === b;
	return (
		a.above === b.above &&
		a.page.objectNumber === b.page.objectNumber &&
		a.rect.x === b.rect.x &&
		a.rect.y === b.rect.y &&
		a.rect.width === b.rect.width &&
		a.rect.height === b.rect.height
	);
}

interface PdfSelectionMenuProps {
	onConfirmRemoval: (removal: PdfHighlightRemoval) => void;
}

/** Floats the selection's menu where the drag let go: below its end, or above its start for a backward drag. For the Stage's overlay. */
export default function PdfSelectionMenu({
	onConfirmRemoval,
}: PdfSelectionMenuProps) {
	const { learningAssetId } = usePdfCore();
	const range = useSelectionState(state =>
		state.hasSelection && !state.isSelecting ? state.range : null,
	);
	// Subscribed to the selection itself: its endpoints can land after its range does, which a read in render would miss.
	const endpoint = useSelector(SelectionToken, menuEndpointOf, sameEndpoint);
	const recordExtractReadPoint = useRecordExtractReadPoint();
	const handleHighlightCreated = useCallback(
		(lastPageIndex: number) => recordExtractReadPoint(lastPageIndex + 1, 0),
		[recordExtractReadPoint],
	);

	if (!range || !endpoint) return null;

	return (
		<Anchored
			anchor={{ page: endpoint.page, bounds: endpoint.rect }}
			placement={endpoint.above ? "top" : "bottom"}
			gap={MENU_GAP_PX}>
			<PdfFloatingMenu
				// A new selection is a new menu, so what it read from the old one can't linger.
				key={`${range.start.page.objectNumber}:${range.start.index}-${range.end.page.objectNumber}:${range.end.index}`}
				learningAssetId={learningAssetId}
				above={endpoint.above}
				onHighlightCreated={handleHighlightCreated}
				onConfirmRemoval={onConfirmRemoval}
			/>
		</Anchored>
	);
}
