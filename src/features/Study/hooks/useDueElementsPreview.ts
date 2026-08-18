import { useCallback, useEffect } from "react";
import { useWindowEvent } from "@mantine/hooks";
import { ELEMENT_CREATED_EVENT } from "../../../api/elements/events/elementCreatedEvent";
import { getDueElements } from "../../../api/study/api/studyApi";
import useApi from "../../../hooks/useApi";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { useTauriEvent } from "../../../hooks/useTauriEvent";
import { queueLoaded } from "../../../stores/study/studyReducer";
import { selectStudyStatus } from "../../../stores/study/studySelectors";
import {
	defaultGlobalSyncEventManager,
	ListenerType,
} from "../../../stores/sync/managers/syncEventManager";
import { PRIORITY_CHANGED } from "../../../types/events/priorityChangedEvent";
import { STUDY_SESSION_SETTINGS_CHANGED } from "../../../types/events/studySessionSettingsChangedEvent";

// Lets the sidebar preview which elements are due before a session starts,
// without affecting status/counts/etc. Once a session is active, the queue
// is only ever driven by the session engine itself.
export function useDueElementsPreview() {
	const dispatch = useAppDispatch();
	const status = useAppSelector(selectStudyStatus);
	const { callApi } = useApi();

	const isStudying = status === "studying";

	function refresh() {
		void callApi(async () => {
			const queue = await getDueElements();
			dispatch(queueLoaded(queue));
		});
	}

	useEffect(() => {
		if (isStudying) return;
		refresh();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isStudying, callApi, dispatch]);

	useTauriEvent(ELEMENT_CREATED_EVENT, () => {
		if (isStudying) return;
		refresh();
	});

	useWindowEvent(PRIORITY_CHANGED, () => {
		if (isStudying) return;
		refresh();
	});

	useWindowEvent(STUDY_SESSION_SETTINGS_CHANGED, () => {
		if (isStudying) return;
		refresh();
	});

	const refreshOnSync = useCallback(() => {
		if (!isStudying) refresh();
		return Promise.resolve();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isStudying, callApi, dispatch]);

	useEffect(() => {
		defaultGlobalSyncEventManager.addListener(
			ListenerType.PostSyncComplete,
			refreshOnSync,
		);
		return () =>
			defaultGlobalSyncEventManager.removeListener(
				ListenerType.PostSyncComplete,
				refreshOnSync,
			);
	}, [refreshOnSync]);
}
