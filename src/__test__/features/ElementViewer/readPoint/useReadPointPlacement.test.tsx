import { PropsWithChildren } from "react";
import { Provider } from "react-redux";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useReadPointPlacement } from "../../../../features/ElementViewer/readPoint/useReadPointPlacement";
import { setupStore } from "../../../../stores/store";
import { selectReadPointSource } from "../../../../stores/app/appSelectors";
import { ReadPointSource } from "../../../../types/elements/readPointSource";

vi.mock("../../../../api/elements/api/elementsApi", () => ({
	updateReadPoint: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../managers/closeRequestedEventManager", () => ({
	defaultCloseRequestedEventManager: {
		addHandler: vi.fn(),
		removeHandler: vi.fn(),
	},
}));

vi.mock("../../../../managers/syncEventManager", () => ({
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

function renderPlacement(
	options: {
		learningAssetId?: string;
		resumeSource?: ReadPointSource;
		onLeave?: (source: ReadPointSource) => void;
	} = {},
) {
	const store = setupStore();
	function Wrapper({ children }: PropsWithChildren) {
		return <Provider store={store}>{children}</Provider>;
	}
	const rendered = renderHook(
		() =>
			useReadPointPlacement({
				learningAssetId: "r1",
				initial: INITIAL,
				...options,
			}),
		{ wrapper: Wrapper },
	);
	return { ...rendered, store };
}

describe("useReadPointPlacement", () => {
	it("Should report the manual precedence on unmount when the read point was set by hand", () => {
		// Arrange

		const onLeave = vi.fn();
		const { result, unmount } = renderPlacement({ onLeave });
		result.current.place({ split: 2, block: 3 }, "manual");

		// Act

		unmount();

		// Assert

		expect(onLeave).toHaveBeenCalledWith("manual");
	});

	it("Should keep refusing automatic tracking when opened with a manual resume source", () => {
		// Arrange

		const { result } = renderPlacement({ resumeSource: "manual" });

		// Act

		const accepted = result.current.accepts("automatic");

		// Assert

		expect(accepted).toBe(false);
	});

	it("Should accept automatic tracking when opened without a resume source", () => {
		// Arrange

		const { result } = renderPlacement();

		// Act

		const accepted = result.current.accepts("automatic");

		// Assert

		expect(accepted).toBe(true);
	});

	it("Should publish the opening source when mounted", () => {
		// Arrange & Act

		const { store } = renderPlacement({ resumeSource: "lookup" });

		// Assert

		expect(selectReadPointSource(store.getState())).toBe("lookup");
	});

	it("Should publish the new source when a placement overrides it", () => {
		// Arrange

		const { result, store } = renderPlacement();

		// Act

		result.current.place({ split: 2, block: 3 }, "extract");

		// Assert

		expect(selectReadPointSource(store.getState())).toBe("extract");
	});

	it("Should publish the opening source again when reset", () => {
		// Arrange

		const { result, store } = renderPlacement();
		result.current.place({ split: 2, block: 3 }, "manual");

		// Act

		result.current.reset();

		// Assert

		expect(selectReadPointSource(store.getState())).toBe("automatic");
	});

	it("Should clear the source when unmounted, even if reset afterwards", () => {
		// Arrange

		const { result, store, unmount } = renderPlacement();
		result.current.place({ split: 2, block: 3 }, "manual");

		// Act

		unmount();
		result.current.reset();

		// Assert

		expect(selectReadPointSource(store.getState())).toBeNull();
	});
});
