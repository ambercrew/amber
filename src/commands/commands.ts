import { createElement, ReactNode } from "react";
import { NavigateFunction } from "react-router";
import { notifications } from "@mantine/notifications";
import {
	ArrowCounterClockwiseIcon,
	ArrowLeftIcon,
	ArrowRightIcon,
	ArrowsClockwiseIcon,
	ArrowsDownUpIcon,
	BookOpenIcon,
	BookmarkSimpleIcon,
	CalendarBlankIcon,
	CardsIcon,
	ChatCircleTextIcon,
	EraserIcon,
	FadersHorizontalIcon,
	GearIcon,
	KeyboardIcon,
	TreeStructureIcon,
	MagnifyingGlassIcon,
	MagnifyingGlassMinusIcon,
	MagnifyingGlassPlusIcon,
	MapPinIcon,
	MoonIcon,
	PencilSimpleIcon,
	ShuffleIcon,
	SidebarSimpleIcon,
	UploadSimpleIcon,
} from "@phosphor-icons/react";
import { AppDispatch, RootState } from "../stores/store";
import { setVirtualKeyboardSuppressedAction } from "../stores/app/appActions";
import {
	openDueDateModal,
	openImportModal,
	openPriorityModal,
	openShortcutsModal,
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
import {
	selectCanZoomAppWide,
	selectCurrentElement,
	selectElementTreeError,
} from "../stores/elements/elementsSelectors";
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
import { isCoarsePointer } from "../utils/pointer";
import { selectIsVirtualKeyboardSuppressed } from "../stores/app/appSelectors";
import { ZOOM_STEP, clampZoom } from "../utils/zoom";
import {
	CREATE_CARD_SHORTCUT,
	FIND_IN_PAGE_SHORTCUT,
	FOCUS_AI_CHAT_SHORTCUT,
	FOCUS_TREE_SHORTCUT,
	GO_BACK_SHORTCUT,
	GO_FORWARD_SHORTCUT,
	IMPORT_SHORTCUT,
	OPEN_DUE_DATE_SHORTCUT,
	OPEN_PRIORITY_SHORTCUT,
	OPEN_SETTINGS_SHORTCUT,
	RESET_ZOOM_SHORTCUT,
	SET_READ_POINT_SHORTCUT,
	SHOW_SHORTCUTS_SHORTCUT,
	TOGGLE_LEFT_SIDEBAR_SHORTCUT,
	TOGGLE_RIGHT_SIDEBAR_SHORTCUT,
	TOGGLE_STUDY_SESSION_SHORTCUT,
	ZOOM_IN_ALT_SHORTCUT,
	ZOOM_IN_SHORTCUT,
	ZOOM_OUT_SHORTCUT,
} from "../config/shortcuts";
import { TOGGLE_LEFT_SIDEBAR_REQUESTED } from "../types/events/toggleLeftSidebarRequestedEvent";
import { requestFocus } from "../hooks/useFocusRequest";
import { TOGGLE_RIGHT_SIDEBAR_REQUESTED } from "../types/events/toggleRightSidebarRequestedEvent";
import { createCardAction } from "../stores/elements/elementsActions";
import { hasDue } from "../utils/elementDue";
import { newCardDto } from "../features/Sidebar/components/ElementTree/elementTreeUtils";
import { paths } from "../paths";

export const commandIds = [
	"import",
	"toggle-left-sidebar",
	"toggle-right-sidebar",
	"show-shortcuts",
	"go-back",
	"go-forward",
	"focus-tree",
	"create-card",
	"open-due-date",
	"focus-ai-chat",
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
	"disable-virtual-keyboard",
	"enable-virtual-keyboard",
] as const;
export type CommandId = (typeof commandIds)[number];

export const commandGroups = [
	"App",
	"Navigation",
	"Find in page",
	"Zoom",
	"AI",
	"Element actions",
	"Editor",
	"Study",
] as const;
export type CommandGroup = (typeof commandGroups)[number];

export interface Command {
	id: CommandId;
	group: CommandGroup;
	label: string | ((state: RootState) => string);
	shortcut?: string; // useHotkeys format: 'mod+L', 'mod+shift+P', 'alt+ArrowUp'
	/** Further keys that also run the command but aren't displayed, e.g. `mod+[plus]` beside `mod+=`. */
	extraShortcuts?: string[];
	/** Describes the shortcut in the help when one key runs several commands; the others are left out. */
	shortcutLabel?: string;
	/** Keep the shortcuts from firing while typing in a text field or the editor. */
	outsideTextFields?: boolean;
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
		group: "Element actions",
		label: "Import",
		shortcut: IMPORT_SHORTCUT,
		icon: createElement(UploadSimpleIcon),
		execute: dispatch => dispatch(openImportModal()),
	},
	"toggle-left-sidebar": {
		id: "toggle-left-sidebar",
		group: "App",
		label: "Toggle left sidebar",
		shortcut: TOGGLE_LEFT_SIDEBAR_SHORTCUT,
		icon: createElement(SidebarSimpleIcon),
		execute: () =>
			window.dispatchEvent(new Event(TOGGLE_LEFT_SIDEBAR_REQUESTED)),
	},
	"toggle-right-sidebar": {
		id: "toggle-right-sidebar",
		group: "App",
		label: "Toggle right sidebar",
		shortcut: TOGGLE_RIGHT_SIDEBAR_SHORTCUT,
		icon: createElement(SidebarSimpleIcon, { mirrored: true }),
		execute: () =>
			window.dispatchEvent(new Event(TOGGLE_RIGHT_SIDEBAR_REQUESTED)),
	},
	"show-shortcuts": {
		id: "show-shortcuts",
		group: "App",
		label: "Show keyboard shortcuts",
		shortcut: SHOW_SHORTCUTS_SHORTCUT,
		icon: createElement(KeyboardIcon),
		enabled: () => !isCoarsePointer(),
		execute: dispatch => dispatch(openShortcutsModal()),
	},
	"go-back": {
		id: "go-back",
		group: "Navigation",
		label: "Go back",
		shortcut: GO_BACK_SHORTCUT,
		outsideTextFields: true,
		icon: createElement(ArrowLeftIcon),
		enabled: () => canGoBack(),
		execute: (_dispatch, _getState, navigate) => void navigate(-1),
	},
	"go-forward": {
		id: "go-forward",
		group: "Navigation",
		label: "Go forward",
		shortcut: GO_FORWARD_SHORTCUT,
		outsideTextFields: true,
		icon: createElement(ArrowRightIcon),
		execute: (_dispatch, _getState, navigate) => void navigate(1),
	},
	"focus-tree": {
		id: "focus-tree",
		group: "Navigation",
		label: "Focus current element in the tree",
		shortcut: FOCUS_TREE_SHORTCUT,
		icon: createElement(TreeStructureIcon),
		execute: () => requestFocus("tree"),
	},
	"create-card": {
		id: "create-card",
		group: "Element actions",
		label: "New card on this element",
		shortcut: CREATE_CARD_SHORTCUT,
		icon: createElement(CardsIcon),
		enabled: state => {
			const type = selectCurrentElement(state)?.type;
			return !!type && type !== "card";
		},
		execute: (dispatch, getState, navigate) => {
			const parent =
				selectCurrentElement(getState())?.data.meta.elementId;
			if (!parent || parent.type === "card") return;
			const id = crypto.randomUUID();
			void dispatch(createCardAction(newCardDto(parent, id))).then(
				created => {
					if (created) void navigate(paths.element("card", id));
					// The tree may be hidden, so its error alert can't be relied on.
					else
						notifications.show({
							color: "red",
							title: "Couldn't create the card",
							message: selectElementTreeError(getState()),
						});
				},
			);
		},
	},
	"open-due-date": {
		id: "open-due-date",
		group: "Element actions",
		label: "Set due date",
		shortcut: OPEN_DUE_DATE_SHORTCUT,
		icon: createElement(CalendarBlankIcon),
		enabled: state => {
			const type = selectCurrentElement(state)?.type;
			return !!type && hasDue(type);
		},
		execute: dispatch => dispatch(openDueDateModal()),
	},
	"focus-ai-chat": {
		id: "focus-ai-chat",
		group: "AI",
		label: "Ask AI",
		shortcut: FOCUS_AI_CHAT_SHORTCUT,
		icon: createElement(ChatCircleTextIcon),
		enabled: state => selectSettings(state)?.enableAi ?? false,
		execute: () => requestFocus("aiChat"),
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
		group: "App",
		label: "Open settings",
		shortcut: OPEN_SETTINGS_SHORTCUT,
		icon: createElement(GearIcon),
		execute: dispatch => dispatch(openSettingsModal()),
	},
	"toggle-theme": {
		id: "toggle-theme",
		group: "App",
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
		shortcutLabel: "Switch between study and edit mode",
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
		group: "Element actions",
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
		group: "Element actions",
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
		group: "Element actions",
		label: "Go to read point",
		icon: createElement(MapPinIcon),
		enabled: state => selectCurrentElement(state)?.type === "learningAsset",
		execute: () => {
			window.dispatchEvent(new Event(READ_POINT_MANUAL_GOTO_REQUESTED));
		},
	},
	"open-priority": {
		id: "open-priority",
		group: "Element actions",
		label: "Set priority",
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
		group: "Find in page",
		label: "Find in page",
		shortcut: FIND_IN_PAGE_SHORTCUT,
		icon: createElement(MagnifyingGlassIcon),
		enabled: state => selectCurrentElement(state) !== null,
		execute: dispatch => dispatch(openSearch()),
	},
	sync: {
		id: "sync",
		group: "App",
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
		group: "Zoom",
		label: "Zoom in",
		shortcut: ZOOM_IN_SHORTCUT,
		extraShortcuts: [ZOOM_IN_ALT_SHORTCUT],
		icon: createElement(MagnifyingGlassPlusIcon),
		enabled: state => !isMobile() && selectCanZoomAppWide(state),
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
		group: "Zoom",
		label: "Zoom out",
		shortcut: ZOOM_OUT_SHORTCUT,
		icon: createElement(MagnifyingGlassMinusIcon),
		enabled: state => !isMobile() && selectCanZoomAppWide(state),
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
	"disable-virtual-keyboard": {
		id: "disable-virtual-keyboard",
		group: "App",
		label: "Disable on-screen keyboard",
		icon: createElement(KeyboardIcon),
		enabled: state =>
			isCoarsePointer() && !selectIsVirtualKeyboardSuppressed(state),
		execute: dispatch => dispatch(setVirtualKeyboardSuppressedAction(true)),
	},
	"enable-virtual-keyboard": {
		id: "enable-virtual-keyboard",
		group: "App",
		label: "Enable on-screen keyboard",
		icon: createElement(KeyboardIcon),
		// Deliberately not gated on the pointer type: suppression outlives a
		// restart, so this has to stay reachable even if the device stops
		// reporting a coarse pointer (a tablet with a keyboard case attached).
		enabled: state => selectIsVirtualKeyboardSuppressed(state),
		execute: dispatch =>
			dispatch(setVirtualKeyboardSuppressedAction(false)),
	},
	"reset-zoom": {
		id: "reset-zoom",
		group: "Zoom",
		label: "Reset zoom",
		shortcut: RESET_ZOOM_SHORTCUT,
		icon: createElement(ArrowCounterClockwiseIcon),
		enabled: state => !isMobile() && selectCanZoomAppWide(state),
		execute: dispatch => {
			void dispatch(
				saveSettings(
					buildUpdateSettingsRequest({ zoomPercentage: 100 }),
				),
			);
		},
	},
};

// React Router numbers its history entries; the first one has nothing behind it.
function canGoBack() {
	const state = window.history.state as { idx?: number } | null;
	return (state?.idx ?? 0) > 0;
}

/** Declaration order, for consumers that list/iterate commands rather than look one up by id. */
export const commands: Command[] = Object.values(commandsById);
