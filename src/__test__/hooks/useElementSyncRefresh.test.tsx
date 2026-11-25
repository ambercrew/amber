import { act } from "@testing-library/react";
import { useElementSyncRefresh } from "../../hooks/useElementSyncRefresh";
import { useElementParams } from "../../hooks/useElementParams";
import { loadCurrentElementAction } from "../../stores/elements/elementsActions";
import {
	defaultGlobalSyncEventManager,
	ListenerType,
} from "../../managers/syncEventManager";
import { setupStore } from "../../stores/store";
import { renderWithProviders } from "../test-utils/renderWithProviders";

vi.mock(import("../../hooks/useElementParams"));
vi.mock(import("../../stores/elements/elementsActions"));

function HookWrapper() {
	useElementSyncRefresh();
	return null;
}

async function finishSync(changedKeys: string[] | null = null) {
	const store = setupStore();
	renderWithProviders(<HookWrapper />, { store });
	await act(() =>
		defaultGlobalSyncEventManager.notifyListeners(
			ListenerType.PostSyncComplete,
			{ changedKeys },
		),
	);
	return store;
}

describe("useElementSyncRefresh", () => {
	beforeEach(() => {
		vi.mocked(useElementParams).mockReturnValue({
			type: "card",
			id: "card-1",
		});
		vi.mocked(loadCurrentElementAction).mockReturnValue((() =>
			Promise.resolve(true)) as unknown as ReturnType<
			typeof loadCurrentElementAction
		>);
	});

	it("Should reload and remount the open element when a sync ends", async () => {
		// Arrange & Act

		const store = await finishSync();

		// Assert

		expect(loadCurrentElementAction).toHaveBeenCalledWith({
			type: "card",
			id: "card-1",
		});
		expect(store.getState().sync.elementRefreshCount).toBe(1);
	});

	it("Should not remount when the open element no longer exists", async () => {
		// Arrange

		vi.mocked(loadCurrentElementAction).mockReturnValue((() =>
			Promise.resolve(false)) as unknown as ReturnType<
			typeof loadCurrentElementAction
		>);

		// Act

		const store = await finishSync();

		// Assert

		expect(store.getState().sync.elementRefreshCount).toBe(0);
	});

	it("Should reload the open element when the sync changed it", async () => {
		// Arrange & Act

		const store = await finishSync(["other", "card-1"]);

		// Assert

		expect(store.getState().sync.elementRefreshCount).toBe(1);
	});

	it("Should keep the open element's editors when the sync didn't change it", async () => {
		// Arrange

		vi.mocked(loadCurrentElementAction).mockClear();

		// Act

		const store = await finishSync(["other"]);

		// Assert

		expect(loadCurrentElementAction).not.toHaveBeenCalled();
		expect(store.getState().sync.elementRefreshCount).toBe(0);
	});

	it("Should load the element again before remounting when edits were saved while it loaded", async () => {
		// Arrange

		vi.mocked(loadCurrentElementAction).mockClear();
		const savedEdits = vi
			.fn<() => Promise<boolean>>()
			.mockResolvedValueOnce(true)
			.mockResolvedValue(false);
		defaultGlobalSyncEventManager.addListener(
			ListenerType.PreSyncComplete,
			savedEdits,
		);

		// Act

		const store = await finishSync(["card-1"]);

		// Assert

		defaultGlobalSyncEventManager.removeListener(
			ListenerType.PreSyncComplete,
			savedEdits,
		);
		expect(loadCurrentElementAction).toHaveBeenCalledTimes(2);
		expect(store.getState().sync.elementRefreshCount).toBe(1);
	});

	it("Should keep the editors when edits keep being saved while it loads", async () => {
		// Arrange

		vi.mocked(loadCurrentElementAction).mockClear();
		const savedEdits = vi
			.fn<() => Promise<boolean>>()
			.mockResolvedValue(true);
		defaultGlobalSyncEventManager.addListener(
			ListenerType.PreSyncComplete,
			savedEdits,
		);

		// Act

		const store = await finishSync(["card-1"]);

		// Assert

		defaultGlobalSyncEventManager.removeListener(
			ListenerType.PreSyncComplete,
			savedEdits,
		);
		expect(loadCurrentElementAction).toHaveBeenCalledTimes(3);
		expect(store.getState().sync.elementRefreshCount).toBe(0);
	});
});
