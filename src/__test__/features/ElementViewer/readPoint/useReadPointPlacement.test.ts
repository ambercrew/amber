import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useReadPointPlacement } from "../../../../features/ElementViewer/readPoint/useReadPointPlacement";

vi.mock("../../../../api/elements/api/elementsApi", () => ({
	updateReadPoint: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../managers/closeRequestedEventManager", () => ({
	defaultCloseRequestedEventManager: {
		addHandler: vi.fn(),
		removeHandler: vi.fn(),
	},
}));

vi.mock("../../../../stores/sync/managers/syncEventManager", () => ({
	defaultGlobalSyncEventManager: {
		addListener: vi.fn(),
		removeListener: vi.fn(),
	},
	ListenerType: {
		PreSyncStart: "PreSyncStart",
		PreSyncComplete: "PreSyncComplete",
	},
}));

const INITIAL = { split: 1, block: 0 };

describe("useReadPointPlacement", () => {
	it("Should report the manual precedence on unmount when the read point was set by hand", () => {
		// Arrange

		const onLeave = vi.fn();
		const { result, unmount } = renderHook(() =>
			useReadPointPlacement({
				learningAssetId: "r1",
				initial: INITIAL,
				onLeave,
			}),
		);
		result.current.place({ split: 2, block: 3 }, "manual");

		// Act

		unmount();

		// Assert

		expect(onLeave).toHaveBeenCalledWith("manual");
	});

	it("Should keep refusing automatic tracking when opened with a manual resume source", () => {
		// Arrange

		const { result } = renderHook(() =>
			useReadPointPlacement({
				learningAssetId: "r1",
				initial: INITIAL,
				resumeSource: "manual",
			}),
		);

		// Act

		const accepted = result.current.accepts("automatic");

		// Assert

		expect(accepted).toBe(false);
	});

	it("Should accept automatic tracking when opened without a resume source", () => {
		// Arrange

		const { result } = renderHook(() =>
			useReadPointPlacement({ learningAssetId: "r1", initial: INITIAL }),
		);

		// Act

		const accepted = result.current.accepts("automatic");

		// Assert

		expect(accepted).toBe(true);
	});
});
