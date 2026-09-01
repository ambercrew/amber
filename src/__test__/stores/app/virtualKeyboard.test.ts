import { setupStore } from "../../../stores/store";
import { setVirtualKeyboardSuppressedAction } from "../../../stores/app/appActions";
import { selectIsVirtualKeyboardSuppressed } from "../../../stores/app/appSelectors";
import { loadVirtualKeyboardSuppressed } from "../../../stores/app/virtualKeyboardStorage";

beforeEach(() => {
	localStorage.clear();
});

describe("setVirtualKeyboardSuppressedAction", () => {
	it("Should suppress the on-screen keyboard and remember it when turned on", () => {
		// Arrange

		const store = setupStore();
		// Suppression is the default, so turn it off to have something to turn on.
		store.dispatch(setVirtualKeyboardSuppressedAction(false));

		// Act

		store.dispatch(setVirtualKeyboardSuppressedAction(true));

		// Assert

		expect(selectIsVirtualKeyboardSuppressed(store.getState())).toBe(true);
		expect(loadVirtualKeyboardSuppressed()).toBe(true);
	});

	it("Should stop suppressing the on-screen keyboard and remember it when turned off", () => {
		// Arrange

		const store = setupStore();
		store.dispatch(setVirtualKeyboardSuppressedAction(true));

		// Act

		store.dispatch(setVirtualKeyboardSuppressedAction(false));

		// Assert

		expect(selectIsVirtualKeyboardSuppressed(store.getState())).toBe(false);
		expect(loadVirtualKeyboardSuppressed()).toBe(false);
	});

	it("Should blur the focused element when turned on", () => {
		// Arrange

		const store = setupStore();
		store.dispatch(setVirtualKeyboardSuppressedAction(false));
		const input = document.createElement("input");
		document.body.appendChild(input);
		input.focus();

		// Act

		store.dispatch(setVirtualKeyboardSuppressedAction(true));

		// Assert

		expect(document.activeElement).not.toBe(input);
		input.remove();
	});

	it("Should keep the focused element when turned off", () => {
		// Arrange

		const store = setupStore();
		store.dispatch(setVirtualKeyboardSuppressedAction(true));
		const input = document.createElement("input");
		document.body.appendChild(input);
		input.focus();

		// Act

		store.dispatch(setVirtualKeyboardSuppressedAction(false));

		// Assert

		expect(document.activeElement).toBe(input);
		input.remove();
	});
});

describe("loadVirtualKeyboardSuppressed", () => {
	it("Should report suppression when nothing was stored", () => {
		// Arrange & Act

		const actual = loadVirtualKeyboardSuppressed();

		// Assert

		expect(actual).toBe(true);
	});
});
