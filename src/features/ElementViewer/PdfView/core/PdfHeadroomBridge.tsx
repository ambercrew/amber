import { useEffect } from "react";
import { HEADROOM_FIXED_AT } from "../../../../config/layout";
import useAppDispatch from "../../../../hooks/useAppDispatch";
import { headroomOverrideSet } from "../../../../stores/app/appReducer";
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
	const dispatch = useAppDispatch();

	useEffect(() => {
		if (hideRequests > 0) hideHeadroom(scroller);
	}, [hideRequests, scroller]);

	useEffect(() => {
		onPinnedChange(pinned);
		dispatch(headroomOverrideSet(pinned));
	}, [pinned, onPinnedChange, dispatch]);

	// Hand control back to the main scroll area once the PDF unmounts.
	useEffect(() => {
		return () => {
			dispatch(headroomOverrideSet(null));
		};
	}, [dispatch]);

	return null;
}
