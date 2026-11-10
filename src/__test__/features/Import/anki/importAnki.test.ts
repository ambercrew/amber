import { importAnki } from "../../../../features/Import/anki/importAnki";
import { importAnki as importAnkiPackage } from "../../../../api/import/api/importApi";
import { ImportContext } from "../../../../features/Import/importContext";

vi.mock(import("../../../../api/import/api/importApi"));

function makeCtx(): ImportContext {
	return {
		dispatch: vi.fn() as unknown as ImportContext["dispatch"],
		navigate: vi.fn() as unknown as ImportContext["navigate"],
		parent: { type: "folder", id: "parent-id" },
		priorityPosition: 0,
	};
}

describe("importAnki", () => {
	it("Should import the package under the parent in one call when given a package", async () => {
		// Arrange

		vi.mocked(importAnkiPackage).mockResolvedValue({
			type: "folder",
			id: "deck-id",
		});
		const ctx = makeCtx();

		// Act

		const actual = await importAnki(
			new Uint8Array([0x50, 0x4b]).buffer,
			ctx,
			"source-1",
		);

		// Assert

		expect(importAnkiPackage).toHaveBeenCalledWith({
			bytesBase64: "UEs=",
			parent: { type: "folder", id: "parent-id" },
			bibliographicalSourceId: "source-1",
		});
		expect(actual).toEqual({ type: "folder", id: "deck-id" });
	});
});
