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
	CalendarBlankIcon,
	CardsIcon,
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
	QueueIcon,
	SidebarSimpleIcon,
	SlidersIcon,
	TrashIcon,
	UploadSimpleIcon,
} from "@phosphor-icons/react";
import { AppDispatch, RootState } from "../stores/store";
import { setVirtualKeyboardSuppressedAction } from "../stores/app/appActions";
import {
	openAiPromptLibraryModal,
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
import { runReadingCommand } from "./readingCommands";
import { MarkSlot } from "../types/elements/learningAssetMark";
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
	GO_TO_MARK_1_SHORTCUT,
	GO_TO_MARK_2_SHORTCUT,
	GO_TO_MARK_3_SHORTCUT,
	GO_TO_READ_POINT_SHORTCUT,
	RESET_ZOOM_SHORTCUT,
	SET_MARK_1_SHORTCUT,
	SET_MARK_2_SHORTCUT,
	SET_MARK_3_SHORTCUT,
	SET_READ_POINT_SHORTCUT,
	SHOW_SHORTCUTS_SHORTCUT,
	SYNC_SHORTCUT,
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
import {
	AiPromptLibraryIcon,
	AskAiIcon,
	BrowserIcon,
	HomeIcon,
	NewAiPromptIcon,
	GoToMarkIcon,
	ReadPointIcon,
	SetMarkIcon,
} from "../config/icons";
import {
	LeftSidebarTab,
	SHOW_LEFT_SIDEBAR_TAB_REQUESTED,
} from "../types/events/showLeftSidebarTabRequestedEvent";

export const commandIds = [
	"enter-study-mode",
	"enter-edit-mode",
	"open-study-session-settings",
	"manage-study-profiles",
	"import",
	"create-card",
	"open-priority",
	"open-due-date",
	"set-read-point",
	"go-to-read-point",
	"clear-read-point",
	"set-mark-1",
	"set-mark-2",
	"set-mark-3",
	"go-to-mark-1",
	"go-to-mark-2",
	"go-to-mark-3",
	"go-home",
	"open-browser",
	"go-back",
	"go-forward",
	"focus-tree",
	"show-priority-queue",
	"show-trash",
	"focus-ai-chat",
	"open-ai-prompt-library",
	"new-ai-prompt",
	"find-in-page",
	"zoom-in",
	"zoom-out",
	"reset-zoom",
	"sync",
	"open-settings",
	"show-shortcuts",
	"toggle-theme",
	"toggle-left-sidebar",
	"toggle-right-sidebar",
	"disable-virtual-keyboard",
	"enable-virtual-keyboard",
] as const;
export type CommandId = (typeof commandIds)[number];

export const commandGroups = [
	"Study",
	"Elements",
	"Editor",
	"Navigation",
	"AI",
	"Find in page",
	"Zoom",
	"App",
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
	/** Hidden from the palette until a search is typed. */
	searchOnly?: boolean;
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
	"open-study-session-settings": {
		id: "open-study-session-settings",
		group: "Study",
		label: "Study session settings",
		icon: createElement(SlidersIcon),
		execute: dispatch => dispatch(openStudySessionSettingsModal()),
	},
	"manage-study-profiles": {
		id: "manage-study-profiles",
		group: "Study",
		label: "Manage study profiles",
		icon: createElement(FadersHorizontalIcon),
		execute: dispatch => dispatch(openStudyProfileModal()),
	},
	import: {
		id: "import",
		group: "Elements",
		label: "Import file or web page…",
		shortcut: IMPORT_SHORTCUT,
		icon: createElement(UploadSimpleIcon),
		execute: dispatch => dispatch(openImportModal()),
	},
	"create-card": {
		id: "create-card",
		group: "Elements",
		label: "New card under current element",
		searchOnly: true,
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
	"open-priority": {
		id: "open-priority",
		group: "Elements",
		label: "Set priority",
		shortcut: OPEN_PRIORITY_SHORTCUT,
		icon: createElement(ArrowsDownUpIcon),
		enabled: state => selectCurrentElement(state) !== null,
		execute: dispatch => dispatch(openPriorityModal()),
	},
	"open-due-date": {
		id: "open-due-date",
		group: "Elements",
		label: "Set due date",
		shortcut: OPEN_DUE_DATE_SHORTCUT,
		icon: createElement(CalendarBlankIcon),
		enabled: state => {
			const type = selectCurrentElement(state)?.type;
			return !!type && hasDue(type);
		},
		execute: dispatch => dispatch(openDueDateModal()),
	},
	"set-read-point": {
		id: "set-read-point",
		group: "Elements",
		label: "Set read point",
		searchOnly: true,
		shortcut: SET_READ_POINT_SHORTCUT,
		icon: createElement(ReadPointIcon),
		enabled: state => selectCurrentElement(state)?.type === "learningAsset",
		execute: () => {
			runReadingCommand({ type: "set-read-point" });
			notifications.show({ message: "Read point set" });
		},
	},
	"go-to-read-point": {
		id: "go-to-read-point",
		group: "Elements",
		label: "Go to read point",
		searchOnly: true,
		shortcut: GO_TO_READ_POINT_SHORTCUT,
		icon: createElement(MapPinIcon),
		enabled: state => selectCurrentElement(state)?.type === "learningAsset",
		execute: () => runReadingCommand({ type: "go-to-read-point" }),
	},
	"clear-read-point": {
		id: "clear-read-point",
		group: "Elements",
		label: "Clear read point",
		searchOnly: true,
		icon: createElement(EraserIcon),
		enabled: state => selectCurrentElement(state)?.type === "learningAsset",
		execute: () => {
			runReadingCommand({ type: "clear-read-point" });
			notifications.show({ message: "Read point cleared" });
		},
	},
	"set-mark-1": setMarkCommand(1, SET_MARK_1_SHORTCUT),
	"set-mark-2": setMarkCommand(2, SET_MARK_2_SHORTCUT),
	"set-mark-3": setMarkCommand(3, SET_MARK_3_SHORTCUT),
	"go-to-mark-1": goToMarkCommand(1, GO_TO_MARK_1_SHORTCUT),
	"go-to-mark-2": goToMarkCommand(2, GO_TO_MARK_2_SHORTCUT),
	"go-to-mark-3": goToMarkCommand(3, GO_TO_MARK_3_SHORTCUT),
	"go-home": {
		id: "go-home",
		group: "Navigation",
		label: "Go to Home",
		icon: createElement(HomeIcon),
		execute: (_dispatch, _getState, navigate) =>
			void navigate(paths.root()),
	},
	"open-browser": {
		id: "open-browser",
		group: "Navigation",
		label: "Open Browser",
		icon: createElement(BrowserIcon),
		execute: (_dispatch, _getState, navigate) =>
			void navigate(paths.browser()),
	},
	"go-back": {
		id: "go-back",
		group: "Navigation",
		label: "Go back",
		searchOnly: true,
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
		searchOnly: true,
		shortcut: GO_FORWARD_SHORTCUT,
		outsideTextFields: true,
		icon: createElement(ArrowRightIcon),
		execute: (_dispatch, _getState, navigate) => void navigate(1),
	},
	"focus-tree": {
		id: "focus-tree",
		group: "Navigation",
		label: "Focus current element in the tree",
		searchOnly: true,
		shortcut: FOCUS_TREE_SHORTCUT,
		icon: createElement(TreeStructureIcon),
		execute: () => requestFocus("tree"),
	},
	"show-priority-queue": {
		id: "show-priority-queue",
		group: "Navigation",
		label: "Show priority queue",
		searchOnly: true,
		icon: createElement(QueueIcon),
		execute: () => showLeftSidebarTab("priority-queue"),
	},
	"show-trash": {
		id: "show-trash",
		group: "Navigation",
		label: "Show trash",
		searchOnly: true,
		icon: createElement(TrashIcon),
		execute: () => showLeftSidebarTab("trash"),
	},
	"focus-ai-chat": {
		id: "focus-ai-chat",
		group: "AI",
		label: "Ask AI",
		shortcut: FOCUS_AI_CHAT_SHORTCUT,
		icon: createElement(AskAiIcon),
		enabled: state => selectSettings(state)?.enableAi ?? false,
		execute: () => requestFocus("aiChat"),
	},
	"open-ai-prompt-library": {
		id: "open-ai-prompt-library",
		group: "AI",
		label: "Open prompt library",
		icon: createElement(AiPromptLibraryIcon),
		enabled: state => selectSettings(state)?.enableAi ?? false,
		execute: dispatch => dispatch(openAiPromptLibraryModal()),
	},
	"new-ai-prompt": {
		id: "new-ai-prompt",
		group: "AI",
		label: "New AI prompt",
		icon: createElement(NewAiPromptIcon),
		enabled: state => selectSettings(state)?.enableAi ?? false,
		execute: dispatch =>
			dispatch(openAiPromptLibraryModal({ newPrompt: true })),
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
	"zoom-in": {
		id: "zoom-in",
		group: "Zoom",
		label: "Zoom in",
		searchOnly: true,
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
		searchOnly: true,
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
	"reset-zoom": {
		id: "reset-zoom",
		group: "Zoom",
		label: "Reset zoom",
		searchOnly: true,
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
	sync: {
		id: "sync",
		group: "App",
		label: "Sync",
		shortcut: SYNC_SHORTCUT,
		icon: createElement(ArrowsClockwiseIcon),
		enabled: state =>
			selectIsSignedIn(state) &&
			!!selectUserInformation(state)?.isEmailVerified &&
			!selectIsSyncing(state),
		execute: dispatch => void dispatch(sync()),
	},
	"open-settings": {
		id: "open-settings",
		group: "App",
		label: "Open settings",
		shortcut: OPEN_SETTINGS_SHORTCUT,
		icon: createElement(GearIcon),
		execute: dispatch => dispatch(openSettingsModal()),
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
	"toggle-theme": {
		id: "toggle-theme",
		group: "App",
		label: state =>
			isCurrentlyDark(state)
				? "Switch to light theme"
				: "Switch to dark theme",
		searchOnly: true,
		icon: createElement(MoonIcon),
		execute: (dispatch, getState) => {
			const next = isCurrentlyDark(getState()) ? "Light" : "Dark";
			void dispatch(
				saveSettings(buildUpdateSettingsRequest({ theme: next })),
			);
		},
	},
	"toggle-left-sidebar": {
		id: "toggle-left-sidebar",
		group: "App",
		label: "Toggle left sidebar",
		searchOnly: true,
		shortcut: TOGGLE_LEFT_SIDEBAR_SHORTCUT,
		icon: createElement(SidebarSimpleIcon),
		execute: () =>
			window.dispatchEvent(new Event(TOGGLE_LEFT_SIDEBAR_REQUESTED)),
	},
	"toggle-right-sidebar": {
		id: "toggle-right-sidebar",
		group: "App",
		label: "Toggle right sidebar",
		searchOnly: true,
		shortcut: TOGGLE_RIGHT_SIDEBAR_SHORTCUT,
		icon: createElement(SidebarSimpleIcon, { mirrored: true }),
		execute: () =>
			window.dispatchEvent(new Event(TOGGLE_RIGHT_SIDEBAR_REQUESTED)),
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
};

function setMarkCommand(slot: MarkSlot, shortcut: string): Command {
	return {
		id: `set-mark-${slot}`,
		group: "Elements",
		label: `Set mark ${slot}`,
		searchOnly: true,
		shortcut,
		icon: createElement(SetMarkIcon),
		enabled: state => selectCurrentElement(state)?.type === "learningAsset",
		execute: () => runReadingCommand({ type: "set-mark", slot }),
	};
}

function goToMarkCommand(slot: MarkSlot, shortcut: string): Command {
	return {
		id: `go-to-mark-${slot}`,
		group: "Elements",
		label: `Go to mark ${slot}`,
		searchOnly: true,
		shortcut,
		icon: createElement(GoToMarkIcon),
		enabled: state => selectCurrentElement(state)?.type === "learningAsset",
		execute: () => runReadingCommand({ type: "go-to-mark", slot }),
	};
}

function showLeftSidebarTab(tab: LeftSidebarTab) {
	window.dispatchEvent(
		new CustomEvent(SHOW_LEFT_SIDEBAR_TAB_REQUESTED, { detail: tab }),
	);
}

// React Router numbers its history entries; the first one has nothing behind it.
function canGoBack() {
	const state = window.history.state as { idx?: number } | null;
	return (state?.idx ?? 0) > 0;
}

/** Declaration order, most used first within each group, for consumers that list commands. */
export const commands: Command[] = Object.values(commandsById);
