import { act, renderHook } from "@testing-library/react";
import {
	requestFocus,
	useFocusOnRequest,
	useFocusRequested,
} from "../../hooks/useFocusRequest";

describe("useFocusRequest", () => {
	it("Should focus when the target mounts after the request", () => {
		// Arrange

		const focus = vi.fn();
		requestFocus("tree");

		// Act

		renderHook(() => useFocusOnRequest("tree", focus));

		// Assert

		expect(focus).toHaveBeenCalledOnce();
	});

	it("Should focus a mounted target when focus is requested", () => {
		// Arrange

		const focus = vi.fn();
		renderHook(() => useFocusOnRequest("aiChat", focus));

		// Act

		act(() => requestFocus("aiChat"));

		// Assert

		expect(focus).toHaveBeenCalledOnce();
	});

	it("Should not focus when the request is for another target", () => {
		// Arrange

		const focus = vi.fn();
		const other = vi.fn();
		renderHook(() => useFocusOnRequest("tree", focus));
		renderHook(() => useFocusOnRequest("aiChat", other));

		// Act

		act(() => requestFocus("aiChat"));

		// Assert

		expect(focus).not.toHaveBeenCalled();
	});

	it("Should notify the panel when focus is requested for its target", () => {
		// Arrange

		const reveal = vi.fn();
		renderHook(() => useFocusRequested("tree", reveal));
		const { unmount } = renderHook(() =>
			useFocusOnRequest("tree", vi.fn()),
		);

		// Act

		act(() => requestFocus("tree"));
		unmount();

		// Assert

		expect(reveal).toHaveBeenCalledOnce();
	});
});
