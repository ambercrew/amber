import { PRIORITY_CHANGED } from "./types/events/priorityChangedEvent";
import { SAVED_SEARCHES_CHANGED } from "./types/events/savedSearchesChangedEvent";
import { STUDY_SESSION_SETTINGS_CHANGED } from "./types/events/studySessionSettingsChangedEvent";
import { TOGGLE_LEFT_SIDEBAR_REQUESTED } from "./types/events/toggleLeftSidebarRequestedEvent";
import { TOGGLE_RIGHT_SIDEBAR_REQUESTED } from "./types/events/toggleRightSidebarRequestedEvent";
import {
	SHOW_LEFT_SIDEBAR_TAB_REQUESTED,
	ShowLeftSidebarTabRequestedEvent,
} from "./types/events/showLeftSidebarTabRequestedEvent";

declare global {
	interface WindowEventMap {
		[PRIORITY_CHANGED]: Event;
		[SAVED_SEARCHES_CHANGED]: Event;
		[STUDY_SESSION_SETTINGS_CHANGED]: Event;
		[TOGGLE_LEFT_SIDEBAR_REQUESTED]: Event;
		[TOGGLE_RIGHT_SIDEBAR_REQUESTED]: Event;
		[SHOW_LEFT_SIDEBAR_TAB_REQUESTED]: ShowLeftSidebarTabRequestedEvent;
	}
}

export {};
