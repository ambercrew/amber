import { useEffect, useRef } from "react";
import { HEADROOM_FIXED_AT } from "../../../App/components/App";
import { useSetHeadroomOverride } from "../../../App/context/headroomOverrideContext";
import { hideHeadroom } from "../../../../hooks/useElementHeadroom";
import { usePdfArrival } from "./pdfCoreContext";
import { usePdfToolbarHeadroom } from "./usePdfToolbarHeadroom";

interface PdfHeadroomBridgeProps {
	onPinnedChange: (pinned: boolean) => void;
}

/** Renders nothing; from inside `<Viewport>`, hands the PDF's own hide-on-scroll state out to the toolbar and the app header. */
export default function PdfHeadroomBridge({
	onPinnedChange,
}: PdfHeadroomBridgeProps) {
	const { hideRequests } = usePdfArrival();
	const { pinned, viewportElement } = usePdfToolbarHeadroom({
		fixedAt: HEADROOM_FIXED_AT,
	});
	const setHeadroomOverride = useSetHeadroomOverride();

	// A jump made before this mounts (behind `<Viewport>`'s gate) still applies once the viewport exists.
	const handledHideRequestsRef = useRef(0);
	useEffect(() => {
		if (!viewportElement || hideRequests === handledHideRequestsRef.current)
			return;
		handledHideRequestsRef.current = hideRequests;
		hideHeadroom(viewportElement);
	}, [hideRequests, viewportElement]);

	useEffect(() => {
		onPinnedChange(pinned);
		setHeadroomOverride?.(pinned);
	}, [pinned, onPinnedChange, setHeadroomOverride]);

	// Hand control back to the main scroll area once the PDF unmounts.
	useEffect(() => {
		return () => setHeadroomOverride?.(null);
	}, [setHeadroomOverride]);

	return null;
}
