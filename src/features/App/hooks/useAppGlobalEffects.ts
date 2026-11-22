import { useEffect } from "react";
import useAppDispatch from "../../../hooks/useAppDispatch";
import { useRedirectIfElementMissing } from "../../../hooks/useRedirectIfElementMissing";
import { useCurrentElementSync } from "../../../hooks/useCurrentElementSync";
import { useElementSyncRefresh } from "../../../hooks/useElementSyncRefresh";
import { useStudySessionFinishedRefresh } from "../../../hooks/useStudySessionFinishedRefresh";
import { useElementDueChangedRefresh } from "../../../hooks/useElementDueChangedRefresh";
import { useCardChangedRefresh } from "../../../hooks/useCardChangedRefresh";
import { useElementRenamedSync } from "../../../hooks/useElementRenamedSync";
import { usePostSyncRefresh } from "../../../hooks/usePostSyncRefresh";
import { useWheelZoom } from "../../../hooks/useWheelZoom";
import { useSessionScheduleChanges } from "../../Study/hooks/useSessionScheduleChanges";
import { useStudySessionAway } from "../../Study/hooks/useStudySessionAway";
import { useStudySessionSummaryToast } from "../../Study/hooks/useStudySessionSummaryToast";
import { useLeechNotifications } from "../../Study/hooks/useLeechNotifications";
import { useOcclusionCardContentsBridge } from "../../ImageOcclusion/hooks/useOcclusionCardContentsBridge";
import { useImportedHtmlConversionBridge } from "../../Import/hooks/useImportedHtmlConversionBridge";
import { useAnkiSyncBridge } from "../../AnkiSync/hooks/useAnkiSyncBridge";
import { initialLoadApplicationState } from "../../../stores/app/appActions";
import { useLexicalConversionBridge } from "./useLexicalConversionBridge";

/** App-wide work with no UI of its own: the initial load, keeping state in step with backend events, and the request bridges. */
export function useAppGlobalEffects() {
	const dispatch = useAppDispatch();

	useRedirectIfElementMissing();
	useCurrentElementSync();
	useElementSyncRefresh();
	useStudySessionFinishedRefresh();
	useElementDueChangedRefresh();
	useCardChangedRefresh();
	useElementRenamedSync();
	usePostSyncRefresh();
	useStudySessionAway();
	useSessionScheduleChanges();
	useStudySessionSummaryToast();
	useLeechNotifications();
	useLexicalConversionBridge();
	useOcclusionCardContentsBridge();
	useImportedHtmlConversionBridge();
	useAnkiSyncBridge();
	useWheelZoom();

	useEffect(() => {
		const contextMenuCb = (e: MouseEvent) => e.preventDefault();
		window.addEventListener("contextmenu", contextMenuCb);
		return () => window.removeEventListener("contextmenu", contextMenuCb);
	}, []);

	useEffect(() => {
		void dispatch(initialLoadApplicationState());
	}, [dispatch]);
}
