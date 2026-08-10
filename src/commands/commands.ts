import { createElement, ReactNode } from "react";
import { NavigateFunction } from "react-router";
import { notifications } from "@mantine/notifications";
import {
	ArrowsDownUpIcon,
	BookOpenIcon,
	BookmarkSimpleIcon,
	EraserIcon,
	FadersHorizontalIcon,
	GearIcon,
	MagnifyingGlassIcon,
	MapPinIcon,
	MoonIcon,
	PencilSimpleIcon,
	ShuffleIcon,
	UploadSimpleIcon,
} from "@phosphor-icons/react";
import { AppDispatch, RootState } from "../stores/store";
import {
	openImportModal,
	openPriorityModal,
	openSettingsModal,
	openStudyProfileModal,
	openStudySessionSettingsModal,
} from "../stores/app/appReducer";
import { openSearch } from "../stores/search/searchReducer";
import { startStudySession } from "../stores/study/studyActions";
import { sessionStopped } from "../stores/study/studyReducer";
import { selectStudyStatus } from "../stores/study/studySelectors";
import { saveSettings } from "../stores/settings/settingsActions";
import { buildUpdateSettingsRequest } from "../api/settings/dto/updateSettingsRequestDto";
import { isCurrentlyDark } from "./commandUtils";
import { selectCurrentElement } from "../stores/elements/elementsSelectors";
import { READ_POINT_MANUAL_SET_REQUESTED } from "../types/events/readPointManualSetRequestedEvent";
import { READ_POINT_MANUAL_CLEAR_REQUESTED } from "../types/events/readPointManualClearRequestedEvent";
import { READ_POINT_MANUAL_GOTO_REQUESTED } from "../types/events/readPointManualGotoRequestedEvent";

export const SPOTLIGHT_SHORTCUT = "mod+K";
export const IMPORT_SHORTCUT = "mod+shift+N";
export const TOGGLE_STUDY_SESSION_SHORTCUT = "mod+L";
export const OPEN_SETTINGS_SHORTCUT = "mod+P";
export const SET_READ_POINT_SHORTCUT = "mod+shift+R";
export const OPEN_PRIORITY_SHORTCUT = "alt+P";
export const FIND_IN_PAGE_SHORTCUT = "mod+F";

export const commandIds = [
	"import",
	"manage-study-profiles",
	"enter-study-mode",
	"enter-edit-mode",
	"open-settings",
	"toggle-theme",
	"set-read-point",
	"clear-read-point",
	"go-to-read-point",
	"open-priority",
	"open-study-session-settings",
	"find-in-page",
] as const;
export type CommandId = (typeof commandIds)[number];

export const commandGroups = [
	"General",
	"Study",
	"Settings",
	"Learning Asset",
] as const;
export type CommandGroup = (typeof commandGroups)[number];

export interface Command {
	id: CommandId;
	group: CommandGroup;
	label: string | ((state: RootState) => string);
	shortcut?: string; // useHotkeys format: 'mod+L', 'mod+shift+P', 'alt+ArrowUp'
	icon?: ReactNode;
	enabled?: (state: RootState) => boolean;
	execute: (
		dispatch: AppDispatch,
		getState: () => RootState,
		navigate: NavigateFunction,
	) => void;
}

export const commandsById: Record<CommandId, Command> = {
	import: {
		id: "import",
		group: "General",
		label: "Import",
		shortcut: IMPORT_SHORTCUT,
		icon: createElement(UploadSimpleIcon),
		execute: dispatch => dispatch(openImportModal()),
	},
	"manage-study-profiles": {
		id: "manage-study-profiles",
		group: "Study",
		label: "Manage study profiles",
		icon: createElement(FadersHorizontalIcon),
		execute: dispatch => dispatch(openStudyProfileModal()),
	},
	"open-settings": {
		id: "open-settings",
		group: "Settings",
		label: "Open settings",
		shortcut: OPEN_SETTINGS_SHORTCUT,
		icon: createElement(GearIcon),
		execute: dispatch => dispatch(openSettingsModal()),
	},
	"toggle-theme": {
		id: "toggle-theme",
		group: "Settings",
		label: state =>
			isCurrentlyDark(state)
				? "Switch to light theme"
				: "Switch to dark theme",
		icon: createElement(MoonIcon),
		execute: (dispatch, getState) => {
			const next = isCurrentlyDark(getState()) ? "Light" : "Dark";
			void dispatch(
				saveSettings(buildUpdateSettingsRequest({ theme: next })),
			);
		},
	},
	"enter-study-mode": {
		id: "enter-study-mode",
		group: "Study",
		label: "Enter study mode",
		shortcut: TOGGLE_STUDY_SESSION_SHORTCUT,
		icon: createElement(BookOpenIcon),
		enabled: state => selectStudyStatus(state) !== "studying",
		execute: (dispatch, _getState, navigate) => {
			void dispatch(startStudySession(navigate)).then(started => {
				if (!started) notifications.show({ message: "Nothing due" });
			});
		},
	},
	"enter-edit-mode": {
		id: "enter-edit-mode",
		group: "Study",
		label: "Enter edit mode",
		shortcut: TOGGLE_STUDY_SESSION_SHORTCUT,
		icon: createElement(PencilSimpleIcon),
		enabled: state => selectStudyStatus(state) === "studying",
		execute: dispatch => dispatch(sessionStopped()),
	},
	"set-read-point": {
		id: "set-read-point",
		group: "Learning Asset",
		label: "Set read point",
		shortcut: SET_READ_POINT_SHORTCUT,
		icon: createElement(BookmarkSimpleIcon),
		enabled: state => selectCurrentElement(state)?.type === "learningAsset",
		execute: () => {
			window.dispatchEvent(new Event(READ_POINT_MANUAL_SET_REQUESTED));
			notifications.show({ message: "Read point set" });
		},
	},
	"clear-read-point": {
		id: "clear-read-point",
		group: "Learning Asset",
		label: "Clear read point",
		icon: createElement(EraserIcon),
		enabled: state => selectCurrentElement(state)?.type === "learningAsset",
		execute: () => {
			window.dispatchEvent(new Event(READ_POINT_MANUAL_CLEAR_REQUESTED));
			notifications.show({ message: "Read point cleared" });
		},
	},
	"go-to-read-point": {
		id: "go-to-read-point",
		group: "Learning Asset",
		label: "Go to read point",
		icon: createElement(MapPinIcon),
		enabled: state => selectCurrentElement(state)?.type === "learningAsset",
		execute: () => {
			window.dispatchEvent(new Event(READ_POINT_MANUAL_GOTO_REQUESTED));
		},
	},
	"open-priority": {
		id: "open-priority",
		group: "Study",
		label: "Set element priority",
		shortcut: OPEN_PRIORITY_SHORTCUT,
		icon: createElement(ArrowsDownUpIcon),
		enabled: state => selectCurrentElement(state) !== null,
		execute: dispatch => dispatch(openPriorityModal()),
	},
	"open-study-session-settings": {
		id: "open-study-session-settings",
		group: "Study",
		label: "Study session settings",
		icon: createElement(ShuffleIcon),
		execute: dispatch => dispatch(openStudySessionSettingsModal()),
	},
	"find-in-page": {
		id: "find-in-page",
		group: "General",
		label: "Find in page",
		shortcut: FIND_IN_PAGE_SHORTCUT,
		icon: createElement(MagnifyingGlassIcon),
		enabled: state => selectCurrentElement(state) !== null,
		execute: dispatch => dispatch(openSearch()),
	},
};

/** Declaration order, for consumers that list/iterate commands rather than look one up by id. */
export const commands: Command[] = Object.values(commandsById);
