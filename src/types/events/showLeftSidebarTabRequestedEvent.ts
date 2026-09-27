export const SHOW_LEFT_SIDEBAR_TAB_REQUESTED = "showLeftSidebarTabRequested";

export type LeftSidebarTab = "tree" | "priority-queue" | "trash";

export type ShowLeftSidebarTabRequestedEvent = CustomEvent<LeftSidebarTab>;
