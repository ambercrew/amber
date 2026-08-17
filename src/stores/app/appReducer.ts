import { PayloadAction, createSlice } from "@reduxjs/toolkit";

export type AuthModalTab = "sign-in" | "sign-up";

export interface AppState {
	startedInitialStateLoading: boolean;
	importModalOpened: boolean;
	studyProfileModalOpened: boolean;
	settingsModalOpened: boolean;
	priorityModalOpened: boolean;
	studySessionSettingsModalOpened: boolean;
	authModalOpened: boolean;
	authModalInitialTab: AuthModalTab;
	verifyEmailModalOpened: boolean;
}

const initialState: AppState = {
	startedInitialStateLoading: false,
	importModalOpened: false,
	studyProfileModalOpened: false,
	settingsModalOpened: false,
	priorityModalOpened: false,
	studySessionSettingsModalOpened: false,
	authModalOpened: false,
	authModalInitialTab: "sign-in",
	verifyEmailModalOpened: false,
};

const appSlice = createSlice({
	name: "app",
	initialState,
	reducers: {
		markStartLoadingOfInitialState: state => {
			state.startedInitialStateLoading = true;
		},
		openImportModal: state => {
			state.importModalOpened = true;
		},
		closeImportModal: state => {
			state.importModalOpened = false;
		},
		openStudyProfileModal: state => {
			state.studyProfileModalOpened = true;
		},
		closeStudyProfileModal: state => {
			state.studyProfileModalOpened = false;
		},
		openSettingsModal: state => {
			state.settingsModalOpened = true;
		},
		closeSettingsModal: state => {
			state.settingsModalOpened = false;
		},
		openPriorityModal: state => {
			state.priorityModalOpened = true;
		},
		closePriorityModal: state => {
			state.priorityModalOpened = false;
		},
		openStudySessionSettingsModal: state => {
			state.studySessionSettingsModalOpened = true;
		},
		closeStudySessionSettingsModal: state => {
			state.studySessionSettingsModalOpened = false;
		},
		openAuthModal: (
			state,
			action: PayloadAction<AuthModalTab | undefined>,
		) => {
			state.authModalOpened = true;
			state.authModalInitialTab = action.payload ?? "sign-in";
		},
		closeAuthModal: state => {
			state.authModalOpened = false;
		},
		openVerifyEmailModal: state => {
			state.verifyEmailModalOpened = true;
		},
		closeVerifyEmailModal: state => {
			state.verifyEmailModalOpened = false;
		},
	},
});

export default appSlice.reducer;

export const {
	markStartLoadingOfInitialState,
	openImportModal,
	closeImportModal,
	openStudyProfileModal,
	closeStudyProfileModal,
	openSettingsModal,
	closeSettingsModal,
	openPriorityModal,
	closePriorityModal,
	openStudySessionSettingsModal,
	closeStudySessionSettingsModal,
	openAuthModal,
	closeAuthModal,
	openVerifyEmailModal,
	closeVerifyEmailModal,
} = appSlice.actions;
