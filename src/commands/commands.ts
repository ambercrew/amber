import { createElement, ReactNode } from "react";
import { NavigateFunction } from "react-router";
import { notifications } from "@mantine/notifications";
import {
	ArrowCounterClockwiseIcon,
	ArrowsClockwiseIcon,
	ArrowsDownUpIcon,
	BookOpenIcon,
	BookmarkSimpleIcon,
	EraserIcon,
	FadersHorizontalIcon,
	GearIcon,
	MagnifyingGlassIcon,
	MagnifyingGlassMinusIcon,
	MagnifyingGlassPlusIcon,
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
import {
	startStudySession,
	stopStudySessionAction,
} from "../stores/study/studyActions";
import { selectStudyStatus } from "../stores/study/studySelectors";
import { saveSettings } from "../stores/settings/settingsActions";
import { buildUpdateSettingsRequest } from "../api/settings/dto/updateSettingsRequestDto";
import { selectSettings } from "../stores/settings/settingsSelector";
import { isCurrentlyDark } from "./commandUtils";
import { selectCurrentElement } from "../stores/elements/elementsSelectors";
import { sync } from "../stores/sync/syncActions";
import { selectIsSyncing } from "../stores/sync/syncSelector";
import {
	selectIsSignedIn,
	selectUserInformation,
} from "../stores/user/userSelectors";
import { READ_POINT_MANUAL_SET_REQUESTED } from "../types/events/readPointManualSetRequestedEvent";
import { READ_POINT_MANUAL_CLEAR_REQUESTED } from "../types/events/readPointManualClearRequestedEvent";
import { READ_POINT_MANUAL_GOTO_REQUESTED } from "../types/events/readPointManualGotoRequestedEvent";
import { isMobile } from "../utils/tauriUtils";
import { ZOOM_STEP, clampZoom } from "../utils/zoom";

export const SPOTLIGHT_SHORTCUT = "mod+K";
export const IMPORT_SHORTCUT = "mod+shift+N";
export const TOGGLE_STUDY_SESSION_SHORTCUT = "mod+L";
export const OPEN_SETTINGS_SHORTCUT = "mod+P";
export const SET_READ_POINT_SHORTCUT = "mod+shift+R";
export const OPEN_PRIORITY_SHORTCUT = "alt+P";
export const FIND_IN_PAGE_SHORTCUT = "mod+F";
export const ZOOM_IN_SHORTCUT = "mod+=";
export const ZOOM_OUT_SHORTCUT = "mod+-";
export const RESET_ZOOM_SHORTCUT = "mod+0";

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
	"sync",
	"zoom-in",
	"zoom-out",
	"reset-zoom",
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
		execute: dispatch => dispatch(stopStudySessionAction()),
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
	sync: {
		id: "sync",
		group: "General",
		label: state => (selectIsSyncing(state) ? "Syncing..." : "Sync"),
		icon: createElement(ArrowsClockwiseIcon),
		enabled: state =>
			selectIsSignedIn(state) &&
			!!selectUserInformation(state)?.isEmailVerified &&
			!selectIsSyncing(state),
		execute: dispatch => void dispatch(sync()),
	},
	"zoom-in": {
		id: "zoom-in",
		group: "Settings",
		label: "Zoom in",
		shortcut: ZOOM_IN_SHORTCUT,
		icon: createElement(MagnifyingGlassPlusIcon),
		enabled: () => !isMobile(),
		execute: (dispatch, getState) => {
			const current = selectSettings(getState())?.zoomPercentage ?? 100;
			void dispatch(
				saveSettings(
					buildUpdateSettingsRequest({
						zoomPercentage: clampZoom(current + ZOOM_STEP),
					}),
				),
			);
		},
	},
	"zoom-out": {
		id: "zoom-out",
		group: "Settings",
		label: "Zoom out",
		shortcut: ZOOM_OUT_SHORTCUT,
		icon: createElement(MagnifyingGlassMinusIcon),
		enabled: () => !isMobile(),
		execute: (dispatch, getState) => {
			const current = selectSettings(getState())?.zoomPercentage ?? 100;
			void dispatch(
				saveSettings(
					buildUpdateSettingsRequest({
						zoomPercentage: clampZoom(current - ZOOM_STEP),
					}),
				),
			);
		},
	},
	"reset-zoom": {
		id: "reset-zoom",
		group: "Settings",
		label: "Reset zoom",
		shortcut: RESET_ZOOM_SHORTCUT,
		icon: createElement(ArrowCounterClockwiseIcon),
		enabled: () => !isMobile(),
		execute: dispatch => {
			void dispatch(
				saveSettings(
					buildUpdateSettingsRequest({ zoomPercentage: 100 }),
				),
			);
		},
	},
};

/** Declaration order, for consumers that list/iterate commands rather than look one up by id. */
export const commands: Command[] = Object.values(commandsById);
