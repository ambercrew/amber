import { TreeDragDropPayload, TreeNodeData } from "@mantine/core";
import { renderHook } from "@testing-library/react";
import {
	shouldUsePointerDragAndDrop,
	useElementTreeDragAndDrop,
} from "../../../../features/Sidebar/hooks/useElementTreeDragAndDrop";
import { isLinux } from "../../../../utils/tauriUtils";

vi.mock(import("../../../../utils/tauriUtils"));

const DATA: TreeNodeData[] = [{ value: "a", label: "a" }];

describe("shouldUsePointerDragAndDrop", () => {
	it("Should use pointer drag and drop on Linux", () => {
		// Arrange

		vi.mocked(isLinux).mockReturnValue(true);

		// Act

		const actual = shouldUsePointerDragAndDrop();

		// Assert

		expect(actual).toBe(true);
	});

	it("Should use native drag and drop on other platforms", () => {
		// Arrange

		vi.mocked(isLinux).mockReturnValue(false);

		// Act

		const actual = shouldUsePointerDragAndDrop();

		// Assert

		expect(actual).toBe(false);
	});
});

describe("useElementTreeDragAndDrop", () => {
	it("Should return pointer props when running on Linux", () => {
		// Arrange

		vi.mocked(isLinux).mockReturnValue(true);

		// Act

		const { result } = renderHook(() =>
			useElementTreeDragAndDrop({ data: DATA, onDrop: vi.fn() }),
		);

		// Assert

		expect(result.current).toHaveProperty("onPointerDown");
		expect(result.current).not.toHaveProperty("onDragDrop");
	});

	it("Should return native onDragDrop props when not running on Linux", () => {
		// Arrange

		vi.mocked(isLinux).mockReturnValue(false);

		// Act

		const { result } = renderHook(() =>
			useElementTreeDragAndDrop({ data: DATA, onDrop: vi.fn() }),
		);

		// Assert

		expect(result.current).toHaveProperty("onDragDrop");
		expect(result.current).not.toHaveProperty("onPointerDown");
	});

	it("Should forward the native payload to onDrop when onDragDrop fires", () => {
		// Arrange

		vi.mocked(isLinux).mockReturnValue(false);
		const onDrop = vi.fn();
		const { result } = renderHook(() =>
			useElementTreeDragAndDrop({ data: DATA, onDrop }),
		);
		const { onDragDrop } = result.current as {
			onDragDrop: (payload: TreeDragDropPayload) => void;
		};

		// Act

		onDragDrop({ draggedNode: "a", targetNode: "b", position: "inside" });

		// Assert

		expect(onDrop).toHaveBeenCalledWith("a", "b", "inside");
	});
});
