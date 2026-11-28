import { PayloadAction, createSlice } from "@reduxjs/toolkit";
import { loadVirtualKeyboardSuppressed } from "./virtualKeyboardStorage";
import { PriorityNeighborsResponseDto } from "../../api/elements/dto/priorityNeighborsDto";
import { ReadPointSource } from "../../types/elements/readPointSource";
import { MarkSlot } from "../../types/elements/learningAssetMark";

export type AuthModalTab = "sign-in" | "sign-up";

/** What a focus shortcut can focus. */
export type FocusTarget = "tree" | "aiChat" | "globalSearch";

export interface AppState {
	startedInitialStateLoading: boolean;
	importModalOpened: boolean;
	studyProfileModalOpened: boolean;
	settingsModalOpened: boolean;
	priorityModalOpened: boolean;
	dueDateModalOpened: boolean;
	shortcutsModalOpened: boolean;
	aiPromptLibraryModalOpened: boolean;
	/** Bumped on each request to start a blank new prompt in the library, even while it's open. */
	aiPromptLibraryNewPromptRequest: number;
	studySessionSettingsModalOpened: boolean;
	authModalOpened: boolean;
	authModalInitialTab: AuthModalTab;
	verifyEmailModalOpened: boolean;
	manageAccountModalOpened: boolean;
	/** When true the editor never asks for the on-screen keyboard, so a touch
	 * user can select text and make extracts without it covering the page. */
	virtualKeyboardSuppressed: boolean;
	/** Which marks the open learning asset has set, for quick settings; null with none open. */
	markSlots: {
		learningAssetId: string;
		slots: MarkSlot[];
	} | null;
	/** A focus request waiting for its target to mount. */
	pendingFocus: FocusTarget | null;
	/** What last placed the open learning asset's read point, shown in the header; null with none open. */
	readPointSource: {
		learningAssetId: string;
		source: ReadPointSource;
	} | null;
	/** Whether the main scroll area's headroom shows the header (and footer, while studying). */
	mainScrollPinned: boolean;
	/** Set by a view that scrolls its own container (the PDF view) to drive the header instead; null hands it back. */
	headroomOverride: boolean | null;
	/** An element the tree expands down to once it's in the tree (its creation arrives in a batch). */
	pendingTreeReveal: string | null;
	/** The priority modal remounts after each commit, sooner than its preview's debounce;
	 * starting from the element's last neighbors keeps the preview from flashing. */
	lastPriorityPreview: {
		key: string;
		neighbors: PriorityNeighborsResponseDto;
	} | null;
}

const initialState: AppState = {
	startedInitialStateLoading: false,
	importModalOpened: false,
	studyProfileModalOpened: false,
	settingsModalOpened: false,
	priorityModalOpened: false,
	dueDateModalOpened: false,
	shortcutsModalOpened: false,
	aiPromptLibraryModalOpened: false,
	aiPromptLibraryNewPromptRequest: 0,
	studySessionSettingsModalOpened: false,
	authModalOpened: false,
	authModalInitialTab: "sign-in",
	verifyEmailModalOpened: false,
	manageAccountModalOpened: false,
	virtualKeyboardSuppressed: loadVirtualKeyboardSuppressed(),
	pendingFocus: null,
	readPointSource: null,
	markSlots: null,
	mainScrollPinned: true,
	headroomOverride: null,
	pendingTreeReveal: null,
	lastPriorityPreview: null,
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
		openDueDateModal: state => {
			state.dueDateModalOpened = true;
		},
		closeDueDateModal: state => {
			state.dueDateModalOpened = false;
		},
		openShortcutsModal: state => {
			state.shortcutsModalOpened = true;
		},
		closeShortcutsModal: state => {
			state.shortcutsModalOpened = false;
		},
		openAiPromptLibraryModal: (
			state,
			action: PayloadAction<{ newPrompt?: boolean } | undefined>,
		) => {
			state.aiPromptLibraryModalOpened = true;
			if (action.payload?.newPrompt)
				state.aiPromptLibraryNewPromptRequest += 1;
		},
		closeAiPromptLibraryModal: state => {
			state.aiPromptLibraryModalOpened = false;
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
		openManageAccountModal: state => {
			state.manageAccountModalOpened = true;
		},
		closeManageAccountModal: state => {
			state.manageAccountModalOpened = false;
		},
		setVirtualKeyboardSuppressed: (
			state,
			action: PayloadAction<boolean>,
		) => {
			state.virtualKeyboardSuppressed = action.payload;
		},
		/** Asks `target` to take focus, now if it's mounted or else as soon as it mounts. */
		requestFocus: (state, action: PayloadAction<FocusTarget>) => {
			state.pendingFocus = action.payload;
		},
		focusTaken: (state, action: PayloadAction<FocusTarget>) => {
			if (state.pendingFocus === action.payload)
				state.pendingFocus = null;
		},
		readPointSourceChanged: (
			state,
			action: PayloadAction<{
				learningAssetId: string;
				source: ReadPointSource;
			}>,
		) => {
			state.readPointSource = action.payload;
		},
		/** Clears only `learningAssetId`'s, so a view unmounting after the next one mounted keeps it. */
		readPointSourceCleared: (state, action: PayloadAction<string>) => {
			if (state.readPointSource?.learningAssetId === action.payload)
				state.readPointSource = null;
		},
		markSlotsChanged: (
			state,
			action: PayloadAction<{
				learningAssetId: string;
				slots: MarkSlot[];
			}>,
		) => {
			state.markSlots = action.payload;
		},
		/** Clears only `learningAssetId`'s, so a view unmounting after the next one mounted keeps it. */
		markSlotsCleared: (state, action: PayloadAction<string>) => {
			if (state.markSlots?.learningAssetId === action.payload)
				state.markSlots = null;
		},
		mainScrollPinnedChanged: (state, action: PayloadAction<boolean>) => {
			state.mainScrollPinned = action.payload;
		},
		headroomOverrideSet: (state, action: PayloadAction<boolean | null>) => {
			state.headroomOverride = action.payload;
		},
		/** Asks the element tree to expand down to element `id`, without taking focus. */
		requestTreeReveal: (state, action: PayloadAction<string>) => {
			state.pendingTreeReveal = action.payload;
		},
		setLastPriorityPreview: (
			state,
			action: PayloadAction<AppState["lastPriorityPreview"]>,
		) => {
			state.lastPriorityPreview = action.payload;
		},
		treeRevealed: (state, action: PayloadAction<string>) => {
			if (state.pendingTreeReveal === action.payload)
				state.pendingTreeReveal = null;
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
	openDueDateModal,
	closeDueDateModal,
	openShortcutsModal,
	closeShortcutsModal,
	openAiPromptLibraryModal,
	closeAiPromptLibraryModal,
	openStudySessionSettingsModal,
	closeStudySessionSettingsModal,
	openAuthModal,
	closeAuthModal,
	openVerifyEmailModal,
	closeVerifyEmailModal,
	openManageAccountModal,
	closeManageAccountModal,
	setVirtualKeyboardSuppressed,
	requestFocus,
	focusTaken,
	readPointSourceChanged,
	readPointSourceCleared,
	markSlotsChanged,
	markSlotsCleared,
	requestTreeReveal,
	mainScrollPinnedChanged,
	headroomOverrideSet,
	treeRevealed,
	setLastPriorityPreview,
} = appSlice.actions;
