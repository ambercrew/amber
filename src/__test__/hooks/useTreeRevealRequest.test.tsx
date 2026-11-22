import { act, renderHook } from "@testing-library/react";
import { PropsWithChildren } from "react";
import { Provider } from "react-redux";
import {
	requestTreeReveal,
	useTreeRevealRequest,
} from "../../hooks/useTreeRevealRequest";
import { AppStore, setupStore } from "../../stores/store";

let store: AppStore;

function wrapper({ children }: PropsWithChildren) {
	return <Provider store={store}>{children}</Provider>;
}

beforeEach(() => {
	store = setupStore();
});

describe("useTreeRevealRequest", () => {
	it("Should expand to the element once it's in the tree, then stop asking when the tree changes again", () => {
		// Arrange

		const inTree = new Set<string>();
		const expand = vi.fn((id: string) => inTree.has(id));
		const { rerender } = renderHook(
			({ data }) => useTreeRevealRequest(data, expand),
			{ initialProps: { data: 1 }, wrapper },
		);
		act(() => {
			store.dispatch(requestTreeReveal("imported"));
		});

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
		act(() => {
			store.dispatch(requestTreeReveal("imported"));
		});

		// Act

		renderHook(() => useTreeRevealRequest(1, expand), { wrapper });

		// Assert

		expect(expand).toHaveBeenCalledExactlyOnceWith("imported");
	});
});
