import { RootState } from "../store";

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
