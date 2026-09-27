import { describe, expect, it } from "vitest";
import * as shortcuts from "../../config/shortcuts";
import { EDITOR_RESERVED_SHORTCUTS } from "../../config/shortcuts";

describe("shortcuts", () => {
	it("Should find no conflicts when app shortcuts are checked against the editor's reserved keys", () => {
		// Arrange

		const reserved = new Set(
			EDITOR_RESERVED_SHORTCUTS.map(s => s.toLowerCase()),
		);
		const appShortcuts = Object.values(shortcuts).filter(
			value => typeof value === "string",
		);

		// Act

		const actual = appShortcuts.filter(s =>
			reserved.has(String(s).toLowerCase()),
		);

		// Assert

		expect(actual).toEqual([]);
	});
});
