import { createElement } from "react";
import { notifications } from "@mantine/notifications";
import { listen } from "@tauri-apps/api/event";
import {
	cancelAnkiSync,
	previewAnkiSync,
	syncAnki,
} from "../../api/ankiSync/api/ankiSyncApi";
import { AnkiDeckChoiceDto } from "../../api/ankiSync/dto/ankiSyncPreviewDto";
import {
	ANKI_SYNC_PROGRESS_EVENT,
	AnkiSyncProgressEventDto,
} from "../../api/ankiSync/events/ankiSyncProgressEvent";
import AnkiSyncProgress from "../../features/AnkiSync/components/AnkiSyncProgress";
import { describeAnkiSync } from "../../features/AnkiSync/ankiSyncSummary";
import errorToString from "../../utils/errorToString";
import {
	loadCurrentElementAction,
	loadElementTree,
} from "../elements/elementsActions";
import { AppDispatch, RootState } from "../store";
import { sync } from "../sync/syncActions";
import { bumpElementRefreshCount } from "../sync/syncReducer";
import { selectIsSyncing } from "../sync/syncSelector";
import {
	selectIsOffline,
	selectIsSignedIn,
	selectUserInformation,
} from "../user/userSelectors";
import {
	AnkiSyncReview,
	setAnkiSyncReview,
	setIsAnkiSyncBusy,
} from "./ankiSyncReducer";
import {
	selectAnkiSyncReview,
	selectIsAnkiSyncBusy,
} from "./ankiSyncSelectors";

const SYNC_CANCELLED = "anki-sync-cancelled";

function progressMessage(progress: AnkiSyncProgressEventDto | null) {
	return createElement(AnkiSyncProgress, {
		progress,
		onCancel: () => void cancelAnkiSync(),
	});
}

/**
 * Cloud-syncs around an Anki sync, so another computer syncing with its own Anki sees what this one
 * took from Anki first and doesn't take it again. Skipped offline, signed out or mid-sync. Resolves
 * true when the account syncs but this sync didn't happen, so another device's imports may be missing.
 */
function syncWithOtherDevices() {
	return async (
		dispatch: AppDispatch,
		getState: () => RootState,
	): Promise<boolean> => {
		const state = getState();
		const syncs =
			selectIsSignedIn(state) &&
			!!selectUserInformation(state)?.isEmailVerified;
		if (!syncs) return false;
		if (selectIsOffline(state) || selectIsSyncing(state)) return true;
		return !(await dispatch(sync()));
	};
}

/** Bumped by each preview, so one the user closed or started again doesn't land in a newer review. */
let previewRequest = 0;

/** Opens the review at once and fills it with a sync's preview; `runAnkiSync` runs it once they confirm. */
export function startAnkiSync() {
	return async (dispatch: AppDispatch, getState: () => RootState) => {
		if (selectIsAnkiSyncBusy(getState())) return;
		if (selectAnkiSyncReview(getState())?.status === "loading") return;
		const request = ++previewRequest;
		dispatch(setAnkiSyncReview({ status: "loading" }));
		// First, so the preview counts what other devices already brought over from their Anki.
		const missedCloudSync = await dispatch(syncWithOtherDevices());
		let review: AnkiSyncReview;
		try {
			const preview = await previewAnkiSync();
			review = { status: "ready", preview, missedCloudSync };
		} catch (error) {
			review = { status: "failed", error: errorToString(error) };
		}
		const isCurrent =
			request === previewRequest &&
			selectAnkiSyncReview(getState())?.status === "loading";
		if (isCurrent) dispatch(setAnkiSyncReview(review));
	};
}

/** Runs a sync, reporting its progress and outcome in one notification. */
export function runAnkiSync(deckChoices: AnkiDeckChoiceDto[]) {
	return async (dispatch: AppDispatch) => {
		dispatch(setAnkiSyncReview(null));
		dispatch(setIsAnkiSyncBusy(true));
		const id = notifications.show({
			message: progressMessage(null),
			autoClose: false,
			withCloseButton: false,
		});
		const unlisten = await listen<AnkiSyncProgressEventDto>(
			ANKI_SYNC_PROGRESS_EVENT,
			event =>
				notifications.update({
					id,
					message: progressMessage(event.payload),
				}),
		);
		// A failed sync may already have trashed cards, and trashing emits no event.
		let treeChanged = true;
		try {
			const summary = await syncAnki(deckChoices);
			// An occlusion edited in Anki trashes the cards of its removed masks.
			treeChanged =
				summary.trashedCards > 0 || summary.editedCards.length > 0;
			await dispatch(reloadEditedCurrentElement(summary.editedCards));
			notifications.update({
				id,
				autoClose: 6000,
				withCloseButton: true,
				message: describeAnkiSync(summary),
			});
		} catch (error) {
			const message = errorToString(error);
			const cancelled = message === SYNC_CANCELLED;
			notifications.update({
				id,
				autoClose: cancelled ? 6000 : false,
				withCloseButton: true,
				color: cancelled ? undefined : "red",
				message: cancelled
					? "Anki sync cancelled. Anything it already finished stays."
					: message,
			});
		} finally {
			unlisten();
			if (treeChanged) await dispatch(loadElementTree());
			dispatch(setIsAnkiSyncBusy(false));
		}
		// Even after a failure, which may have taken things from Anki already.
		await dispatch(syncWithOtherDevices());
	};
}

/** Shows the open card's new content when the sync replaced it with an edit from Anki. */
function reloadEditedCurrentElement(editedCards: string[]) {
	return async (dispatch: AppDispatch, getState: () => RootState) => {
		const current = getState().elements.currentElement?.data.meta.elementId;
		if (!current || !editedCards.includes(current.id)) return;
		if (await dispatch(loadCurrentElementAction(current)))
			dispatch(bumpElementRefreshCount());
	};
}
