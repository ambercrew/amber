import { ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	matchesShortcut,
	ModalHotkeysContext,
	useAppHotkeys,
} from "../../commands/useAppHotkeys";

function keyEvent(init: Partial<KeyboardEventInit> & { code?: string }) {
	return new KeyboardEvent("keydown", init);
}

describe("matchesShortcut", () => {
	it("Should match when the pressed key is the shortcut key", () => {
		// Arrange

		const event = keyEvent({ key: "k", code: "KeyK", ctrlKey: true });

		// Act

		const actual = matchesShortcut("mod+K", event);

		// Assert

		expect(actual).toBe(true);
	});

	it("Should match on the physical key when the layout produces a non-latin character", () => {
		// Arrange

		const event = keyEvent({ key: "л", code: "KeyK", ctrlKey: true });

		// Act

		const actual = matchesShortcut("mod+K", event);

		// Assert

		expect(actual).toBe(true);
	});

	it("Should match a shifted shortcut when the layout produces a non-latin character", () => {
		// Arrange

		const event = keyEvent({
			key: "Т",
			code: "KeyN",
			ctrlKey: true,
			shiftKey: true,
		});

		// Act

		const actual = matchesShortcut("mod+shift+N", event);

		// Assert

		expect(actual).toBe(true);
	});

	it("Should not match another latin key on a latin layout", () => {
		// Arrange

		const event = keyEvent({ key: "l", code: "KeyK", ctrlKey: true });

		// Act

		const actual = matchesShortcut("mod+K", event);

		// Assert

		expect(actual).toBe(false);
	});

	it("Should match digits, which the physical key spells differently", () => {
		// Arrange

		const event = keyEvent({ key: "0", code: "Digit0", ctrlKey: true });

		// Act

		const actual = matchesShortcut("mod+0", event);

		// Assert

		expect(actual).toBe(true);
	});

	it("Should match punctuation shortcuts", () => {
		// Arrange

		const event = keyEvent({ key: "=", code: "Equal", ctrlKey: true });

		// Act

		const actual = matchesShortcut("mod+=", event);

		// Assert

		expect(actual).toBe(true);
	});

	it("Should not match when a required modifier is missing", () => {
		// Arrange

		const event = keyEvent({ key: "л", code: "KeyK" });

		// Act

		const actual = matchesShortcut("mod+K", event);

		// Assert

		expect(actual).toBe(false);
	});

	it("Should match named keys such as space", () => {
		// Arrange

		const event = keyEvent({ key: " ", code: "Space" });

		// Act

		const actual = matchesShortcut("space", event);

		// Assert

		expect(actual).toBe(true);
	});

	it("Should match a punctuation key when shift was needed to type it", () => {
		// Arrange

		const event = keyEvent({ key: "?", code: "Slash", shiftKey: true });

		// Act

		const actual = matchesShortcut("?", event);

		// Assert

		expect(actual).toBe(true);
	});

	it("Should match the plus key when shift produced it", () => {
		// Arrange

		const event = keyEvent({
			key: "+",
			code: "Equal",
			ctrlKey: true,
			shiftKey: true,
		});

		// Act

		const actual = matchesShortcut("mod+[plus]", event);

		// Assert

		expect(actual).toBe(true);
	});

	it("Should not match the unshifted key of the same physical key when shift produced plus", () => {
		// Arrange

		const event = keyEvent({
			key: "+",
			code: "Equal",
			ctrlKey: true,
			shiftKey: true,
		});

		// Act

		const actual = matchesShortcut("mod+=", event);

		// Assert

		expect(actual).toBe(false);
	});

	it("Should not match a letter shortcut when shift is held", () => {
		// Arrange

		const event = keyEvent({
			key: "K",
			code: "KeyK",
			ctrlKey: true,
			shiftKey: true,
		});

		// Act

		const actual = matchesShortcut("mod+K", event);

		// Assert

		expect(actual).toBe(false);
	});

	it("Should match a letter shortcut when caps lock produces an uppercase key", () => {
		// Arrange

		const event = keyEvent({ key: "S", code: "KeyS" });

		// Act

		const actual = matchesShortcut("S", event);

		// Assert

		expect(actual).toBe(true);
	});
});

describe("useAppHotkeys", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	function openModal() {
		const dialog = document.createElement("div");
		dialog.setAttribute("aria-modal", "true");
		document.body.append(dialog);
	}

	function pressK() {
		document.documentElement.dispatchEvent(
			new KeyboardEvent("keydown", { key: "k", code: "KeyK" }),
		);
	}

	it("Should fire the handler when no modal is open", () => {
		// Arrange

		const handler = vi.fn();
		renderHook(() => useAppHotkeys([["K", handler]]));

		// Act

		pressK();

		// Assert

		expect(handler).toHaveBeenCalledOnce();
	});

	it("Should not fire the handler when a modal is open over it", () => {
		// Arrange

		const handler = vi.fn();
		renderHook(() => useAppHotkeys([["K", handler]]));
		openModal();

		// Act

		pressK();

		// Assert

		expect(handler).not.toHaveBeenCalled();
	});

	it("Should fire the handler when it is bound inside the open modal", () => {
		// Arrange

		const handler = vi.fn();
		renderHook(() => useAppHotkeys([["K", handler]]), {
			wrapper: ({ children }: { children: ReactNode }) => (
				<ModalHotkeysContext value>{children}</ModalHotkeysContext>
			),
		});
		openModal();

		// Act

		pressK();

		// Assert

		expect(handler).toHaveBeenCalledOnce();
	});
});
