import { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLearningAssetSearch } from "../../../../../../features/ElementViewer/LearningAssetView/plugins/search/useLearningAssetSearch";
import { setupStore } from "../../../../../../stores/store";
import { LearningAssetSplitMetaDto } from "../../../../../../types/elements/learningAssetSplitMetaDto";

const { getLearningAssetSplitTextsMock } = vi.hoisted(() => ({
	getLearningAssetSplitTextsMock: vi.fn(),
}));

vi.mock("../../../../../../api/elements/api/elementsApi", () => ({
	getLearningAssetSplitTexts: getLearningAssetSplitTextsMock,
}));

const SPLITS: LearningAssetSplitMetaDto[] = [1, 2, 3].map(seq => ({
	seq,
	charCount: 10,
	blockCount: 1,
}));

async function renderSearch(mountedSeqs: Set<number>) {
	const store = setupStore({
		search: {
			opened: true,
			query: "cat",
			caseSensitive: false,
			currentIndex: -1,
			totalMatches: 0,
		},
	});
	const rendered = renderHook(
		({ mounted, query }) =>
			useLearningAssetSearch({
				learningAssetId: "asset",
				splits: SPLITS,
				query,
				caseSensitive: false,
				mountedSeqs: mounted,
			}),
		{
			initialProps: { mounted: mountedSeqs, query: "cat" },
			wrapper: ({ children }: { children: ReactNode }) => (
				<Provider store={store}>{children}</Provider>
			),
		},
	);
	// Let the split texts load.
	await act(async () => {});
	return rendered;
}

describe("useLearningAssetSearch", () => {
	beforeEach(() => {
		getLearningAssetSplitTextsMock.mockResolvedValue([
			{ seq: 1, text: "cat cat" },
			{ seq: 2, text: "dog" },
			{ seq: 3, text: "cat" },
		]);
	});

	it("Should count matches in unmounted splits from their text when the texts arrive after the query was set", async () => {
		// Arrange & Act

		const { result } = await renderSearch(new Set());

		// Assert

		expect(result.current.totalMatches).toBe(3);
	});

	it("Should use a mounted split's own count over its text snapshot when the split reports it", async () => {
		// Arrange

		const { result } = await renderSearch(new Set([1]));

		// Act

		act(() => result.current.onSplitMatches("1", 5));

		// Assert

		expect(result.current.totalMatches).toBe(6);
	});

	it("Should ignore a mounted split's count from an earlier query when the query changes", async () => {
		// Arrange

		const mounted = new Set([1]);
		const { result, rerender } = await renderSearch(mounted);
		act(() => result.current.onSplitMatches("1", 5));

		// Act

		rerender({ mounted, query: "dog" });

		// Assert

		expect(result.current.totalMatches).toBe(1);
	});

	it("Should resolve a global index to the split and local index that own it when counts span splits", async () => {
		// Arrange

		const { result } = await renderSearch(new Set());

		// Act

		const target = result.current.resolveMatchTarget(2);

		// Assert

		expect(target).toEqual({ seq: 3, localIndex: 0 });
	});

	it("Should return null when the global index is past the last match", async () => {
		// Arrange

		const { result } = await renderSearch(new Set());

		// Act

		const target = result.current.resolveMatchTarget(3);

		// Assert

		expect(target).toBeNull();
	});

	it("Should convert a split and local index back to its global index when given a target", async () => {
		// Arrange

		const { result } = await renderSearch(new Set());

		// Act

		const index = result.current.toGlobalIndex({ seq: 3, localIndex: 0 });

		// Assert

		expect(index).toBe(2);
	});
});
