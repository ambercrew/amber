export const SHOW_LEFT_SIDEBAR_TAB_REQUESTED = "showLeftSidebarTabRequested";

export type LeftSidebarTab = "tree" | "priority-queue" | "search" | "trash";

export type ShowLeftSidebarTabRequestedEvent = CustomEvent<LeftSidebarTab>;
