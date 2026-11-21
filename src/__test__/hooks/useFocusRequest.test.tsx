import { act, renderHook } from "@testing-library/react";
import { PropsWithChildren } from "react";
import { Provider } from "react-redux";
import {
	requestFocus,
	useFocusOnRequest,
	useFocusRequested,
} from "../../hooks/useFocusRequest";
import { AppStore, setupStore } from "../../stores/store";

let store: AppStore;

function wrapper({ children }: PropsWithChildren) {
	return <Provider store={store}>{children}</Provider>;
}

beforeEach(() => {
	store = setupStore();
});

describe("useFocusRequest", () => {
	it("Should focus when the target mounts after the request", () => {
		// Arrange

		const focus = vi.fn();
		store.dispatch(requestFocus("tree"));

		// Act

		renderHook(() => useFocusOnRequest("tree", focus), { wrapper });

		// Assert

		expect(focus).toHaveBeenCalledOnce();
	});

	it("Should focus a mounted target when focus is requested", () => {
		// Arrange

		const focus = vi.fn();
		renderHook(() => useFocusOnRequest("aiChat", focus), { wrapper });

		// Act

		act(() => {
			store.dispatch(requestFocus("aiChat"));
		});

		// Assert

		expect(focus).toHaveBeenCalledOnce();
	});

	it("Should not focus when the request is for another target", () => {
		// Arrange

		const focus = vi.fn();
		const other = vi.fn();
		renderHook(() => useFocusOnRequest("tree", focus), { wrapper });
		renderHook(() => useFocusOnRequest("aiChat", other), { wrapper });

		// Act

		act(() => {
			store.dispatch(requestFocus("aiChat"));
		});

		// Assert

		expect(focus).not.toHaveBeenCalled();
	});

	it("Should not notify a panel of a request made before it mounted", () => {
		// Arrange

		const reveal = vi.fn();
		store.dispatch(requestFocus("tree"));

		// Act

		renderHook(() => useFocusRequested("tree", reveal), { wrapper });

		// Assert

		expect(reveal).not.toHaveBeenCalled();
	});

	it("Should notify the panel when focus is requested for its target", () => {
		// Arrange

		const reveal = vi.fn();
		renderHook(() => useFocusRequested("tree", reveal), { wrapper });
		const { unmount } = renderHook(
			() => useFocusOnRequest("tree", vi.fn()),
			{ wrapper },
		);

		// Act

		act(() => {
			store.dispatch(requestFocus("tree"));
		});
		unmount();

		// Assert

		expect(reveal).toHaveBeenCalledOnce();
	});

	it("Should notify both panels when focus is requested for two targets before a render", () => {
		// Arrange

		const revealTree = vi.fn();
		const revealChat = vi.fn();
		renderHook(() => useFocusRequested("tree", revealTree), { wrapper });
		renderHook(() => useFocusRequested("aiChat", revealChat), { wrapper });

		// Act

		act(() => {
			store.dispatch(requestFocus("tree"));
			store.dispatch(requestFocus("aiChat"));
		});

		// Assert

		expect(revealTree).toHaveBeenCalledOnce();
		expect(revealChat).toHaveBeenCalledOnce();
	});
});
