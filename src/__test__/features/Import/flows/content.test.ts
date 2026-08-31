import { runContentImport } from "../../../../features/Import/flows/content";
import { normalize } from "../../../../features/Import/normalize";
import { deriveTitle } from "../../../../features/Import/deriveTitle";
import { createImportedLearningAsset } from "../../../../features/Import/createImportedLearningAsset";
import { ImportContext } from "../../../../features/Import/importContext";

vi.mock(import("../../../../features/Import/normalize"));
vi.mock(import("../../../../features/Import/deriveTitle"));
vi.mock(import("../../../../features/Import/createImportedLearningAsset"));

function makeCtx(): ImportContext {
	return {
		dispatch: vi.fn() as unknown as ImportContext["dispatch"],
		navigate: vi.fn() as unknown as ImportContext["navigate"],
		parent: null,
		priorityRank: 5,
	};
}

describe("runContentImport", () => {
	it("Should normalize the provided html directly when html is present", async () => {
		// Arrange

		vi.mocked(normalize).mockResolvedValue("<p>normalized</p>");
		vi.mocked(deriveTitle).mockReturnValue("Title");
		const ctx = makeCtx();

		// Act

		await runContentImport({ html: "<p>raw</p>", text: "raw" }, ctx);

		// Assert

		expect(normalize).toHaveBeenCalledWith("<p>raw</p>", { baseUrl: null });
	});

	it("Should convert plain text into paragraphs when html is null", async () => {
		// Arrange

		vi.mocked(normalize).mockResolvedValue("<p>normalized</p>");
		vi.mocked(deriveTitle).mockReturnValue("Title");
		const ctx = makeCtx();

		// Act

		await runContentImport(
			{ html: null, text: "first paragraph\n\nsecond paragraph" },
			ctx,
		);

		// Assert

		expect(normalize).toHaveBeenCalledWith(
			"<p>first paragraph</p><p>second paragraph</p>",
			{ baseUrl: null },
		);
	});

	it("Should escape html-significant characters when converting plain text", async () => {
		// Arrange

		vi.mocked(normalize).mockResolvedValue("<p>normalized</p>");
		vi.mocked(deriveTitle).mockReturnValue("Title");
		const ctx = makeCtx();

		// Act

		await runContentImport({ html: null, text: "<b>bold</b> & more" }, ctx);

		// Assert

		expect(normalize).toHaveBeenCalledWith(
			"<p>&lt;b&gt;bold&lt;/b&gt; &amp; more</p>",
			{ baseUrl: null },
		);
	});

	it("Should derive the title from the normalized content and create the learning asset", async () => {
		// Arrange

		vi.mocked(normalize).mockResolvedValue("<p>normalized</p>");
		vi.mocked(deriveTitle).mockReturnValue("Derived Title");
		const ctx = makeCtx();

		// Act

		await runContentImport({ html: "<p>raw</p>", text: "raw text" }, ctx);

		// Assert

		expect(deriveTitle).toHaveBeenCalledWith(
			"<p>normalized</p>",
			"raw text",
		);
		expect(createImportedLearningAsset).toHaveBeenCalledWith(
			ctx,
			"Derived Title",
			"<p>normalized</p>",
		);
	});
});
