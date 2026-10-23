import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMarks } from "../../../../features/ElementViewer/marks/useMarks";
import { LearningAssetMark } from "../../../../types/elements/learningAssetMark";
import { ReadingPosition } from "../../../../types/elements/readingPosition";
import { MARK_GOTO_REQUESTED } from "../../../../types/events/markGotoRequestedEvent";
import { MARK_SET_REQUESTED } from "../../../../types/events/markSetRequestedEvent";

const {
	addSyncListenerMock,
	getMarksMock,
	setMarkMock,
	clearMarkMock,
	showUndoMock,
	showNotificationMock,
} = vi.hoisted(() => ({
	addSyncListenerMock: vi.fn(),
	getMarksMock: vi.fn(),
	setMarkMock: vi.fn(),
	clearMarkMock: vi.fn(),
	showUndoMock: vi.fn(),
	showNotificationMock: vi.fn(),
}));

vi.mock("../../../../api/elements/api/elementsApi", () => ({
	getLearningAssetMarks: getMarksMock,
	setLearningAssetMark: setMarkMock,
	clearLearningAssetMark: clearMarkMock,
}));

vi.mock(
	"../../../../features/ElementViewer/marks/markUndoNotification",
	() => ({
		showMarkUndoNotification: showUndoMock,
	}),
);

vi.mock("@mantine/notifications", () => ({
	notifications: { show: showNotificationMock },
}));

vi.mock("../../../../stores/sync/managers/syncEventManager", () => ({
	defaultGlobalSyncEventManager: {
		addListener: addSyncListenerMock,
		removeListener: vi.fn(),
	},
	ListenerType: { PostSyncComplete: "PostSyncComplete" },
}));

const LEARNING_ASSET_ID = "la";

async function renderMarks(
	stored: LearningAssetMark[],
	anchor: ReadingPosition | null = { split: 2, block: 5 },
) {
	getMarksMock.mockResolvedValue(stored);
	const goTo = vi.fn();
	const hook = renderHook(() =>
		useMarks({
			learningAssetId: LEARNING_ASSET_ID,
			resolveSetAnchor: () => anchor,
			goTo,
		}),
	);
	await waitFor(() => expect(hook.result.current).toEqual(stored));
	return { ...hook, goTo };
}

async function requestSet(slot: number) {
	await act(async () => {
		window.dispatchEvent(
			new CustomEvent(MARK_SET_REQUESTED, { detail: slot }),
		);
	});
}

async function undoLastSet() {
	const onUndo = showUndoMock.mock.lastCall?.[2] as () => void;
	await act(async () => onUndo());
}

describe("useMarks", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setMarkMock.mockResolvedValue(undefined);
		clearMarkMock.mockResolvedValue(undefined);
	});

	it("Should write and show the mark when setting an unset slot", async () => {
		// Arrange

		const { result } = await renderMarks([]);

		// Act

		await requestSet(1);

		// Assert

		expect(setMarkMock).toHaveBeenCalledWith({
			learningAssetId: LEARNING_ASSET_ID,
			slot: 1,
			anchor: { split: 2, block: 5 },
		});
		expect(result.current).toEqual([
			{ slot: 1, anchor: { split: 2, block: 5 } },
		]);
		expect(showUndoMock).toHaveBeenCalledWith(
			1,
			false,
			expect.any(Function),
		);
	});

	it("Should keep a newly set mark when a reload started before the write finishes after it", async () => {
		// Arrange

		const { result } = await renderMarks([]);
		const reloadAfterSync = addSyncListenerMock.mock
			.lastCall?.[1] as () => Promise<void>;
		let resolveStaleLoad: (marks: LearningAssetMark[]) => void = () => {};
		getMarksMock.mockReturnValueOnce(
			new Promise(resolve => (resolveStaleLoad = resolve)),
		);
		const written = { slot: 1, anchor: { split: 2, block: 5 } };
		getMarksMock.mockResolvedValue([written]);

		// Act

		let staleLoad: Promise<void> = Promise.resolve();
		act(() => {
			staleLoad = reloadAfterSync();
		});
		await requestSet(1);
		await act(async () => {
			resolveStaleLoad([]);
			await staleLoad;
		});

		// Assert

		await waitFor(() => expect(result.current).toEqual([written]));
		expect(getMarksMock).toHaveBeenCalledTimes(3);
	});

	it("Should clear the mark when undoing a set on an unset slot", async () => {
		// Arrange

		const { result } = await renderMarks([]);
		await requestSet(2);

		// Act

		await undoLastSet();

		// Assert

		expect(clearMarkMock).toHaveBeenCalledWith({
			learningAssetId: LEARNING_ASSET_ID,
			slot: 2,
		});
		expect(result.current).toEqual([]);
	});

	it("Should restore the previous position when undoing a move", async () => {
		// Arrange

		const previous = { split: 0, block: 1 };
		const { result } = await renderMarks([{ slot: 3, anchor: previous }]);
		await requestSet(3);

		// Act

		await undoLastSet();

		// Assert

		expect(showUndoMock).toHaveBeenCalledWith(
			3,
			true,
			expect.any(Function),
		);
		expect(setMarkMock).toHaveBeenLastCalledWith({
			learningAssetId: LEARNING_ASSET_ID,
			slot: 3,
			anchor: previous,
		});
		expect(result.current).toEqual([{ slot: 3, anchor: previous }]);
	});

	it("Should not write when there's nothing to anchor to", async () => {
		// Arrange

		await renderMarks([], null);

		// Act

		await requestSet(1);

		// Assert

		expect(setMarkMock).not.toHaveBeenCalled();
		expect(showUndoMock).not.toHaveBeenCalled();
	});

	it("Should go to the mark's anchor when going to a set mark", async () => {
		// Arrange

		const anchor = { split: 4, block: 0 };
		const { goTo } = await renderMarks([{ slot: 2, anchor }]);

		// Act

		act(() => {
			window.dispatchEvent(
				new CustomEvent(MARK_GOTO_REQUESTED, { detail: 2 }),
			);
		});

		// Assert

		expect(goTo).toHaveBeenCalledWith(anchor, 2);
	});

	it("Should say the mark isn't set when going to an unset mark", async () => {
		// Arrange

		const { goTo } = await renderMarks([]);

		// Act

		act(() => {
			window.dispatchEvent(
				new CustomEvent(MARK_GOTO_REQUESTED, { detail: 1 }),
			);
		});

		// Assert

		expect(goTo).not.toHaveBeenCalled();
		expect(showNotificationMock).toHaveBeenCalledWith({
			message: "Mark 1 isn't set",
		});
	});

	it("Should say the mark couldn't be placed when no position can be resolved", async () => {
		// Arrange

		await renderMarks([], null);

		// Act

		await requestSet(2);

		// Assert

		expect(setMarkMock).not.toHaveBeenCalled();
		expect(showNotificationMock).toHaveBeenCalledWith({
			message:
				"Couldn't place mark 2 here yet, try again once the text has loaded",
		});
	});
});
