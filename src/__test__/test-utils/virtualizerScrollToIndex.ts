import { vi } from "vitest";

/** What the mocked `useVirtualizer` scrolls with, as jsdom has no layout to scroll. */
export const virtualizerScrollToIndex = vi.fn();
