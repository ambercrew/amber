import { describe, expect, it } from "vitest";
import { matchesShortcut } from "../../commands/useAppHotkeys";

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
});
