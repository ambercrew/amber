import { createSelector } from "@reduxjs/toolkit";
import { RootState } from "../store";
import { chromeInsets } from "../../utils/chromeInsets";
import { SAFE_AREA_BOTTOM, SAFE_AREA_TOP } from "../../utils/safeArea";

export const selectStartedInitialStateLoading = (state: RootState) =>
	state.app.startedInitialStateLoading;

export const selectIsImportModalOpened = (state: RootState) =>
	state.app.importModalOpened;

export const selectIsStudyProfileModalOpened = (state: RootState) =>
	state.app.studyProfileModalOpened;

export const selectIsSettingsModalOpened = (state: RootState) =>
	state.app.settingsModalOpened;

export const selectIsPriorityModalOpened = (state: RootState) =>
	state.app.priorityModalOpened;

export const selectIsDueDateModalOpened = (state: RootState) =>
	state.app.dueDateModalOpened;

export const selectIsShortcutsModalOpened = (state: RootState) =>
	state.app.shortcutsModalOpened;

export const selectIsAiPromptLibraryModalOpened = (state: RootState) =>
	state.app.aiPromptLibraryModalOpened;

export const selectAiPromptLibraryNewPromptRequest = (state: RootState) =>
	state.app.aiPromptLibraryNewPromptRequest;

export const selectIsStudySessionSettingsModalOpened = (state: RootState) =>
	state.app.studySessionSettingsModalOpened;

export const selectIsAuthModalOpened = (state: RootState) =>
	state.app.authModalOpened;

export const selectAuthModalInitialTab = (state: RootState) =>
	state.app.authModalInitialTab;

export const selectIsVerifyEmailModalOpened = (state: RootState) =>
	state.app.verifyEmailModalOpened;

export const selectIsManageAccountModalOpened = (state: RootState) =>
	state.app.manageAccountModalOpened;

export const selectIsVirtualKeyboardSuppressed = (state: RootState) =>
	state.app.virtualKeyboardSuppressed;

export const selectPendingFocus = (state: RootState) => state.app.pendingFocus;

export const selectPendingTreeReveal = (state: RootState) =>
	state.app.pendingTreeReveal;

export const selectLastPriorityPreview = (state: RootState) =>
	state.app.lastPriorityPreview;

/** Whether the header shows right now, driven by the main scroll area unless a view overrides it. */
export const selectIsHeaderPinned = (state: RootState) =>
	state.app.headroomOverride ?? state.app.mainScrollPinned;

/** Whether the study session footer shows right now; it hides with the header. */
export const selectIsFooterShown = (state: RootState) =>
	state.study.status === "studying" && selectIsHeaderPinned(state);

export const selectChromeInsets = createSelector(
	[selectIsHeaderPinned, selectIsFooterShown],
	(headerShown, footerShown) =>
		chromeInsets(headerShown, footerShown, SAFE_AREA_TOP, SAFE_AREA_BOTTOM),
);

export const selectReadPointSource = (state: RootState) =>
	state.app.readPointSource?.source ?? null;

export const selectMarkSlots = (state: RootState) =>
	state.app.markSlots?.slots ?? null;
