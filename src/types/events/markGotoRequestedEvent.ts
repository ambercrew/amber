import { MarkSlot } from "../elements/learningAssetMark";

export const MARK_GOTO_REQUESTED = "markGotoRequested";

export type MarkGotoRequestedEvent = CustomEvent<MarkSlot>;
