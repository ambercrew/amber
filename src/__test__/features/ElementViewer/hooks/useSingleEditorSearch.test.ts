import { act, renderHook } from "@testing-library/react";
import { useSingleEditorSearch } from "../../../../features/ElementViewer/hooks/useSingleEditorSearch";

describe("useSingleEditorSearch", () => {
	it("Should total zero matches before any editor reports counts", () => {
		// Arrange

		const { result } = renderHook(() =>
			useSingleEditorSearch(["front", "back"]),
		);

		// Assert

		expect(result.current.totalMatches).toBe(0);
	});

	it("Should sum match counts across every editor", () => {
		// Arrange

		const { result } = renderHook(() =>
			useSingleEditorSearch(["front", "back"]),
		);

		// Act

		act(() => {
			result.current.onMatches("front", 2);
			result.current.onMatches("back", 3);
		});

		// Assert

		expect(result.current.totalMatches).toBe(5);
	});

	it("Should not recompute when an editor reports the same count again", () => {
		// Arrange

		const { result, rerender } = renderHook(() =>
			useSingleEditorSearch(["front", "back"]),
		);
		act(() => {
			result.current.onMatches("front", 2);
		});
		const resolveBefore = result.current.resolveMatchTarget;

		// Act

		act(() => {
			result.current.onMatches("front", 2);
		});
		rerender();

		// Assert

		expect(result.current.resolveMatchTarget).toBe(resolveBefore);
	});

	it("Should resolve a global index to the editor and local index that owns it", () => {
		// Arrange

		const { result } = renderHook(() =>
			useSingleEditorSearch(["front", "back"]),
		);
		act(() => {
			result.current.onMatches("front", 2);
			result.current.onMatches("back", 3);
		});

		// Act & Assert: indices 0-1 belong to "front", 2-4 belong to "back".

		expect(result.current.resolveMatchTarget(0)).toEqual({
			editorKey: "front",
			localIndex: 0,
		});
		expect(result.current.resolveMatchTarget(1)).toEqual({
			editorKey: "front",
			localIndex: 1,
		});
		expect(result.current.resolveMatchTarget(2)).toEqual({
			editorKey: "back",
			localIndex: 0,
		});
		expect(result.current.resolveMatchTarget(4)).toEqual({
			editorKey: "back",
			localIndex: 2,
		});
	});

	it("Should return null when resolving a negative index", () => {
		// Arrange

		const { result } = renderHook(() =>
			useSingleEditorSearch(["front", "back"]),
		);
		act(() => {
			result.current.onMatches("front", 2);
		});

		// Act

		const actual = result.current.resolveMatchTarget(-1);

		// Assert

		expect(actual).toBeNull();
	});

	it("Should return null when resolving an index beyond every editor's matches", () => {
		// Arrange

		const { result } = renderHook(() =>
			useSingleEditorSearch(["front", "back"]),
		);
		act(() => {
			result.current.onMatches("front", 1);
			result.current.onMatches("back", 1);
		});

		// Act

		const actual = result.current.resolveMatchTarget(2);

		// Assert

		expect(actual).toBeNull();
	});

	it("Should exclude an editor not listed in editorKeys from the total, even if it reports matches", () => {
		// Arrange: mirrors a card whose back editor is unmounted while the
		// answer is hidden — its stale count should not count toward the total.

		const { result, rerender } = renderHook(
			({ editorKeys }: { editorKeys: string[] }) =>
				useSingleEditorSearch(editorKeys),
			{ initialProps: { editorKeys: ["front", "back"] } },
		);
		act(() => {
			result.current.onMatches("front", 1);
			result.current.onMatches("back", 4);
		});

		// Act: answer hidden — only "front" remains in editorKeys.

		rerender({ editorKeys: ["front"] });

		// Assert

		expect(result.current.totalMatches).toBe(1);
	});
	it("Should ignore counts reported for another count key when the key changes", () => {
		// Arrange

		const { result, rerender } = renderHook(
			({ countKey }) =>
				useSingleEditorSearch(["front", "back"], countKey),
			{ initialProps: { countKey: "card-a" } },
		);
		act(() => {
			result.current.onMatches("front", 5);
			result.current.onMatches("back", 1);
		});

		// Act

		rerender({ countKey: "card-b" });
		act(() => {
			result.current.onMatches("front", 2);
		});

		// Assert

		expect(result.current.totalMatches).toBe(2);
		expect(result.current.countsComplete).toBe(false);
		expect(result.current.resolveMatchTarget(3)).toBeNull();
	});
});
