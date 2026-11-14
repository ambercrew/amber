import { act, renderHook } from "@testing-library/react";
import {
	requestTreeReveal,
	useTreeRevealRequest,
} from "../../hooks/useTreeRevealRequest";

describe("useTreeRevealRequest", () => {
	it("Should expand to the element once it's in the tree, then stop asking when the tree changes again", () => {
		// Arrange

		const inTree = new Set<string>();
		const expand = vi.fn((id: string) => inTree.has(id));
		const { rerender } = renderHook(
			({ data }) => useTreeRevealRequest(data, expand),
			{ initialProps: { data: 1 } },
		);
		act(() => requestTreeReveal("imported"));

		// Act

		inTree.add("imported");
		rerender({ data: 2 });
		rerender({ data: 3 });

		// Assert

		expect(expand.mock.calls).toEqual([["imported"], ["imported"]]);
	});

	it("Should expand to the element when the tree mounts after the request", () => {
		// Arrange

		const expand = vi.fn(() => true);
		act(() => requestTreeReveal("imported"));

		// Act

		renderHook(() => useTreeRevealRequest(1, expand));

		// Assert

		expect(expand).toHaveBeenCalledExactlyOnceWith("imported");
	});
});
