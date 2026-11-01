import { notifications } from "@mantine/notifications";
import { StudyScopeDto } from "../../api/study/dto/studyScopeDto";
import { findTreeNode } from "../../utils/elementTree";
import { AppDispatch, RootState } from "../store";
import { studyScopeChanged } from "./studyReducer";
import { selectStudyScope } from "./studySelectors";
import { saveStudyScope } from "./studyScopeStorage";

/** Sets the study scope, remembering it for the next time the app starts on this device. */
export function changeStudyScopeAction(scope: StudyScopeDto | null) {
	return (dispatch: AppDispatch): void => {
		saveStudyScope(scope);
		dispatch(studyScopeChanged(scope));
	};
}

/**
 * Resets a scope narrowed to an element that's no longer in the tree (trashed
 * or deleted), which would otherwise study nothing on every launch. Run after
 * each tree load.
 */
export function resetStaleStudyScopeAction() {
	return (dispatch: AppDispatch, getState: () => RootState): void => {
		const state = getState();
		const scope = selectStudyScope(state);
		// The scope is locked mid-session; the next tree load catches it.
		if (scope?.type !== "custom" || state.study.status === "studying") {
			return;
		}

		const isStale = scope.filters.some(
			filter =>
				filter.field === "descendantOf" &&
				filter.operator !== "isNot" &&
				filter.ancestor !== null &&
				!findTreeNode(state.elements.tree, filter.ancestor.id),
		);
		if (!isStale) return;

		dispatch(changeStudyScopeAction(null));
		// Runs outside any component, so it reports like the sync thunk.
		notifications.show({
			message:
				"Study scope reset to everything: the element it was limited to is in the trash or was deleted.",
		});
	};
}
