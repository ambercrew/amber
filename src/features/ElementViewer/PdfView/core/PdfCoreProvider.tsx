import {
	PropsWithChildren,
	useCallback,
	useEffect,
	useEffectEvent,
	useMemo,
	useRef,
	useState,
} from "react";
import { useDocumentState } from "@embedpdf/core/react";
import { useScrollCapability } from "@embedpdf/plugin-scroll/react";
import { ReadingPosition } from "../../../../types/elements/readingPosition";
import { PdfArrivalContext, PdfCoreContext } from "./pdfCoreContext";
import { usePdfNavigator } from "./usePdfNavigator";
import { usePdfZoomPersistence } from "./usePdfZoomPersistence";

interface PdfCoreProviderProps extends PropsWithChildren {
	learningAssetId: string;
	documentId: string;
	initialReadPoint: ReadingPosition;
}

export default function PdfCoreProvider({
	learningAssetId,
	documentId,
	initialReadPoint,
	children,
}: PdfCoreProviderProps) {
	const { provides: scroll } = useScrollCapability();
	const { goToPage, flash, clearFlash, hideRequests } =
		usePdfNavigator(documentId);
	const pageCount = useDocumentState(documentId)?.document?.pageCount ?? 0;

	// The zoom applies within the layout-ready event, so a restoring jump made after it can't be undone by its re-centering.
	const { restoreZoom } = usePdfZoomPersistence(documentId, learningAssetId);
	const [layoutReadyDocumentId, setLayoutReadyDocumentId] = useState<
		string | null
	>(null);
	const handleInitialLayout = useEffectEvent(() => {
		restoreZoom();
		setLayoutReadyDocumentId(documentId);
	});
	useEffect(
		() =>
			scroll?.onLayoutReady(event => {
				if (event.documentId === documentId && event.isInitial)
					handleInitialLayout();
			}),
		[scroll, documentId],
	);
	const layoutReady = layoutReadyDocumentId === documentId;

	const getCurrentPage = useCallback(
		() => scroll?.forDocument(documentId).getCurrentPage() ?? 1,
		[scroll, documentId],
	);
	const menuPageRef = useRef<number | null>(null);
	const getMenuPage = useCallback(() => menuPageRef.current, []);
	const setMenuPage = useCallback((pageNumber: number | null) => {
		menuPageRef.current = pageNumber;
	}, []);

	const value = useMemo(
		() => ({
			learningAssetId,
			documentId,
			initialReadPoint,
			pageCount,
			layoutReady,
			goToPage,
			getCurrentPage,
			getMenuPage,
			setMenuPage,
		}),
		[
			learningAssetId,
			documentId,
			initialReadPoint,
			pageCount,
			layoutReady,
			goToPage,
			getCurrentPage,
			getMenuPage,
			setMenuPage,
		],
	);
	const arrival = useMemo(
		() => ({ flash, clearFlash, hideRequests }),
		[flash, clearFlash, hideRequests],
	);

	return (
		<PdfCoreContext value={value}>
			<PdfArrivalContext value={arrival}>{children}</PdfArrivalContext>
		</PdfCoreContext>
	);
}
