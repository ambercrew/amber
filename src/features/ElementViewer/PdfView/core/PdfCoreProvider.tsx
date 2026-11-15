import {
	PropsWithChildren,
	useCallback,
	useEffect,
	useEffectEvent,
	useMemo,
	useRef,
	useState,
} from "react";
import { useLinkEvent } from "@embedpdf/react/link";
import {
	StageCapability,
	useStage,
	useStageState,
} from "@embedpdf/react/stage";
import { ReadingPosition } from "../../../../types/elements/readingPosition";
import {
	PdfArrivalContext,
	PdfCoreContext,
	PdfScrollPaceContext,
} from "./pdfCoreContext";
import { usePdfNavigator } from "./usePdfNavigator";
import { useStageHost } from "./stageScroll";
import { usePdfScrollPaceTracker } from "./usePdfScrollPaceTracker";
import { usePdfZoomPersistence } from "./usePdfZoomPersistence";

interface PdfCoreProviderProps extends PropsWithChildren {
	learningAssetId: string;
	documentId: string;
	initialReadPoint: ReadingPosition;
}

/** Whether the Stage has measured its viewport and placed the pages, so a jump lands where it should. */
function isLayoutReady(stage: StageCapability) {
	return stage.getViewportSize().height > 0 && stage.getPageBox(0) !== null;
}

export default function PdfCoreProvider({
	learningAssetId,
	documentId,
	initialReadPoint,
	children,
}: PdfCoreProviderProps) {
	const stage = useStage();
	const { goToPage, announceJump, hideRequests } = usePdfNavigator(stage);
	// Following a link inside the PDF is a jump too.
	useLinkEvent(
		link => link.onActivated,
		({ activation }) => {
			if (activation.status === "revealed") announceJump();
		},
	);
	const pageCount = useStageState(state => state.pageCount);

	// The zoom applies before the layout counts as ready, so a restoring jump made after it lands at the right scale.
	const { restoreZoom } = usePdfZoomPersistence(stage, learningAssetId);
	// The Viewer remounts per document, so this only turns true once.
	const [layoutReady, setLayoutReady] = useState(false);
	const handleInitialLayout = useEffectEvent(() => {
		restoreZoom();
		setLayoutReady(true);
	});
	useEffect(() => {
		let handled = false;
		const check = () => {
			if (handled || !isLayoutReady(stage)) return;
			handled = true;
			handleInitialLayout();
		};
		const unsubscribeViewport = stage.onViewportChanged(check);
		const unsubscribeCamera = stage.onCameraChanged(check);
		check();
		return () => {
			unsubscribeViewport();
			unsubscribeCamera();
		};
	}, [stage]);

	const getCurrentPage = useCallback(
		() => stage.getCurrentPageIndex() + 1,
		[stage],
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
			announceJump,
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
			announceJump,
			getCurrentPage,
			getMenuPage,
			setMenuPage,
		],
	);
	const arrival = useMemo(() => ({ hideRequests }), [hideRequests]);
	const { flying } = usePdfScrollPaceTracker(useStageHost());
	const scrollPace = useMemo(() => ({ flying }), [flying]);

	return (
		<PdfCoreContext value={value}>
			<PdfArrivalContext value={arrival}>
				<PdfScrollPaceContext value={scrollPace}>
					{children}
				</PdfScrollPaceContext>
			</PdfArrivalContext>
		</PdfCoreContext>
	);
}
