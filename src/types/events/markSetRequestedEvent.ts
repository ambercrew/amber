import { MarkSlot } from "../elements/learningAssetMark";

export const MARK_SET_REQUESTED = "markSetRequested";

export type MarkSetRequestedEvent = CustomEvent<MarkSlot>;
