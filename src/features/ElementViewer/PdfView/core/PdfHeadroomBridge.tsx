import { useEffect } from "react";
import { HEADROOM_FIXED_AT } from "../../../App/components/App";
import { useSetHeadroomOverride } from "../../../App/context/headroomOverrideContext";
import { hideHeadroom } from "../../../../hooks/useElementHeadroom";
import { usePdfArrival } from "./pdfCoreContext";
import { usePdfToolbarHeadroom } from "./usePdfToolbarHeadroom";

interface PdfHeadroomBridgeProps {
	onPinnedChange: (pinned: boolean) => void;
}

/** Renders nothing; hands the PDF's own hide-on-scroll state out to the toolbar and the app header. */
export default function PdfHeadroomBridge({
	onPinnedChange,
}: PdfHeadroomBridgeProps) {
	const { hideRequests } = usePdfArrival();
	const { pinned, scroller } = usePdfToolbarHeadroom({
		fixedAt: HEADROOM_FIXED_AT,
	});
	const setHeadroomOverride = useSetHeadroomOverride();

	useEffect(() => {
		if (hideRequests > 0) hideHeadroom(scroller);
	}, [hideRequests, scroller]);

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
