import { runFileImport } from "../../../../features/Import/flows/file";
import {
	extractPdf,
	getPdfPageCount,
} from "../../../../features/Import/pdf/extract";
import { extractEpub } from "../../../../features/Import/epub/extract";
import { extractMarkdown } from "../../../../features/Import/markdown/extract";
import { extractHtml } from "../../../../features/Import/html/extract";
import { extractText } from "../../../../features/Import/text/extract";
import { normalize } from "../../../../features/Import/normalize";
import { createImportedLearningAsset } from "../../../../features/Import/createImportedLearningAsset";
import { createImportedPdfLearningAsset } from "../../../../features/Import/createImportedPdfLearningAsset";
import { createBibliographicalSource } from "../../../../api/bibliographicalSources/api/bibliographicalSourcesApi";
import { BibliographicalSourceResponseDto } from "../../../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { ImportContext } from "../../../../features/Import/importContext";
import { AppDispatch, RootState } from "../../../../stores/store";

type Thunk = (dispatch: AppDispatch, getState: () => RootState) => unknown;

vi.mock(import("../../../../features/Import/pdf/extract"));
vi.mock(import("../../../../features/Import/epub/extract"));
vi.mock(import("../../../../features/Import/markdown/extract"));
vi.mock(import("../../../../features/Import/html/extract"));
vi.mock(import("../../../../features/Import/text/extract"));
vi.mock(import("../../../../features/Import/normalize"));
vi.mock(import("../../../../features/Import/createImportedLearningAsset"));
vi.mock(import("../../../../features/Import/createImportedPdfLearningAsset"));
vi.mock(
	import("../../../../api/bibliographicalSources/api/bibliographicalSourcesApi"),
);

function makeSource(
	overrides: Partial<BibliographicalSourceResponseDto> = {},
): BibliographicalSourceResponseDto {
	return {
		id: "source-1",
		createdAt: "2024-01-01T00:00:00Z",
		modifiedAt: "2024-01-01T00:00:00Z",
		title: "PDF Title",
		authors: null,
		publicationDate: null,
		sourceType: "File",
		location: null,
		elementCount: 0,
		...overrides,
	};
}

function makeCtx(): ImportContext {
	const dispatch: AppDispatch = vi.fn((action: unknown) =>
		typeof action === "function"
			? (action as Thunk)(dispatch, () => ({}) as RootState)
			: action,
	) as unknown as AppDispatch;
	return {
		dispatch,
		navigate: vi.fn() as unknown as ImportContext["navigate"],
		parent: null,
		priorityPosition: 5,
	};
}

function pdfFile(name = "document.pdf"): File {
	const bytes = new TextEncoder().encode("%PDF-1.4 rest of file");
	return new File([bytes], name, { type: "application/pdf" });
}

function epubFile(name = "book.epub"): File {
	const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
	return new File([bytes], name, { type: "application/epub+zip" });
}

function markdownFile(name = "notes.md"): File {
	return new File(["# Title\n\ncontent"], name, { type: "text/markdown" });
}

function htmlFile(name = "page.html"): File {
	return new File(["<p>content</p>"], name, { type: "text/html" });
}

function textFile(name = "notes.txt"): File {
	return new File(["content"], name, { type: "text/plain" });
}

function unsupportedFile(name = "image.png"): File {
	return new File(["not a document"], name, { type: "image/png" });
}

describe("runFileImport", () => {
	it("Should return unsupported-file when the file is not a PDF, EPUB, markdown, HTML, or text file", async () => {
		// Arrange

		const ctx = makeCtx();

		// Act

		const actual = await runFileImport([unsupportedFile()], ctx, true);

		// Assert

		expect(actual).toEqual({ kind: "unsupported-file" });
		expect(extractPdf).not.toHaveBeenCalled();
	});

	it("Should create a pdf-type learning asset without extraction when extractPdfContent is false", async () => {
		// Arrange

		vi.mocked(getPdfPageCount).mockResolvedValue(3);
		const source = makeSource({ id: "source-1" });
		vi.mocked(createBibliographicalSource).mockResolvedValue(source);
		const ctx = makeCtx();

		// Act

		const actual = await runFileImport([pdfFile("report.pdf")], ctx, false);

		// Assert

		expect(actual).toBeNull();
		expect(extractPdf).not.toHaveBeenCalled();
		expect(createImportedPdfLearningAsset).toHaveBeenCalledWith(
			ctx,
			"report",
			expect.any(String),
			3,
			"source-1",
		);
	});

	it("Should import as a pdf when the header is preceded by other bytes", async () => {
		// Arrange

		vi.mocked(getPdfPageCount).mockResolvedValue(1);
		vi.mocked(createBibliographicalSource).mockResolvedValue(makeSource());
		const bytes = new TextEncoder().encode("\r\n%PDF-1.4 rest of file");
		const file = new File([bytes], "report.pdf", { type: "" });
		const ctx = makeCtx();

		// Act

		const actual = await runFileImport([file], ctx, false);

		// Assert

		expect(actual).toBeNull();
		expect(createImportedPdfLearningAsset).toHaveBeenCalled();
	});

	it("Should extract, normalize, and create a learning asset for a valid pdf", async () => {
		// Arrange

		vi.mocked(extractPdf).mockResolvedValue({
			title: "PDF Title",
			authors: "Jane Doe",
			publicationDate: "2020-01-01",
			html: "<p>pdf content</p>",
			pageCount: 1,
		});
		vi.mocked(normalize).mockResolvedValue("<p>normalized</p>");
		const source = makeSource({ id: "source-1" });
		vi.mocked(createBibliographicalSource).mockResolvedValue(source);
		const ctx = makeCtx();

		// Act

		const actual = await runFileImport([pdfFile()], ctx, true);

		// Assert

		expect(actual).toBeNull();
		expect(normalize).toHaveBeenCalledWith("<p>pdf content</p>", {
			baseUrl: null,
		});
		expect(createBibliographicalSource).toHaveBeenCalledWith({
			title: "document.pdf",
			authors: "Jane Doe",
			publicationDate: "2020-01-01",
			sourceType: "File",
			location: "document.pdf",
		});
		expect(createImportedLearningAsset).toHaveBeenCalledWith(
			ctx,
			"PDF Title",
			"<p>normalized</p>",
			"source-1",
		);
	});

	it("Should fall back to the filename when the extracted title is not plausible", async () => {
		// Arrange

		vi.mocked(extractPdf).mockResolvedValue({
			title: "Untitled",
			authors: null,
			publicationDate: null,
			html: "<p>content</p>",
			pageCount: 1,
		});
		vi.mocked(normalize).mockResolvedValue("<p>content</p>");
		vi.mocked(createBibliographicalSource).mockResolvedValue(makeSource());
		const ctx = makeCtx();

		// Act

		await runFileImport([pdfFile("report.pdf")], ctx, true);

		// Assert

		expect(createImportedLearningAsset).toHaveBeenCalledWith(
			ctx,
			"report",
			"<p>content</p>",
			"source-1",
		);
	});

	it("Should fall back to the filename when the extracted title looks like a filename", async () => {
		// Arrange

		vi.mocked(extractPdf).mockResolvedValue({
			title: "report.docx",
			authors: null,
			publicationDate: null,
			html: "<p>content</p>",
			pageCount: 1,
		});
		vi.mocked(normalize).mockResolvedValue("<p>content</p>");
		vi.mocked(createBibliographicalSource).mockResolvedValue(makeSource());
		const ctx = makeCtx();

		// Act

		await runFileImport([pdfFile("myfile.pdf")], ctx, true);

		// Assert

		expect(createImportedLearningAsset).toHaveBeenCalledWith(
			ctx,
			"myfile",
			"<p>content</p>",
			"source-1",
		);
	});

	it("Should return no-text-layer when extraction rejects with that specific error", async () => {
		// Arrange — Tauri's `invoke` rejects with the backend's raw error
		// string, not an `Error` instance.

		vi.mocked(extractPdf).mockRejectedValue("no-text-layer");
		const ctx = makeCtx();

		// Act

		const actual = await runFileImport([pdfFile()], ctx, true);

		// Assert

		expect(actual).toEqual({ kind: "no-text-layer" });
	});

	it("Should return extraction-failed with the error message when extraction rejects with any other error", async () => {
		// Arrange

		vi.mocked(extractPdf).mockRejectedValue("corrupt file");
		const ctx = makeCtx();

		// Act

		const actual = await runFileImport([pdfFile()], ctx, true);

		// Assert

		expect(actual).toEqual({
			kind: "extraction-failed",
			message: "corrupt file",
		});
	});

	it("Should report progress via the onProgress callback", async () => {
		// Arrange

		vi.mocked(extractPdf).mockImplementation((_bytes, onProgress) => {
			onProgress?.({ done: 1, total: 2 });
			return Promise.resolve({
				title: "T",
				authors: null,
				publicationDate: null,
				html: "<p>c</p>",
				pageCount: 2,
			});
		});
		vi.mocked(normalize).mockResolvedValue("<p>c</p>");
		vi.mocked(createBibliographicalSource).mockResolvedValue(makeSource());
		const onProgress = vi.fn();
		const ctx = makeCtx();

		// Act

		await runFileImport([pdfFile()], ctx, true, onProgress);

		// Assert

		expect(onProgress).toHaveBeenCalledWith({ done: 1, total: 2 });
	});

	it("Should extract, normalize, and create a learning asset for a valid epub", async () => {
		// Arrange

		vi.mocked(extractEpub).mockResolvedValue({
			title: "Epub Title",
			authors: "Jane Doe",
			publicationDate: "2020-01-01",
			html: "<p>epub content</p>",
			chapterCount: 3,
		});
		vi.mocked(normalize).mockResolvedValue("<p>normalized</p>");
		const source = makeSource({ id: "source-1" });
		vi.mocked(createBibliographicalSource).mockResolvedValue(source);
		const ctx = makeCtx();

		// Act

		const actual = await runFileImport([epubFile()], ctx, true);

		// Assert

		expect(actual).toBeNull();
		expect(extractPdf).not.toHaveBeenCalled();
		expect(normalize).toHaveBeenCalledWith("<p>epub content</p>", {
			baseUrl: null,
		});
		expect(createImportedLearningAsset).toHaveBeenCalledWith(
			ctx,
			"Epub Title",
			"<p>normalized</p>",
			"source-1",
		);
	});

	it("Should return no-content when epub extraction rejects with that specific error", async () => {
		// Arrange — Tauri's `invoke` rejects with the backend's raw error
		// string, not an `Error` instance.

		vi.mocked(extractEpub).mockRejectedValue("no-content");
		const ctx = makeCtx();

		// Act

		const actual = await runFileImport([epubFile()], ctx, true);

		// Assert

		expect(actual).toEqual({ kind: "no-content" });
	});

	it("Should return extraction-failed with the error message when epub extraction rejects with any other error", async () => {
		// Arrange

		vi.mocked(extractEpub).mockRejectedValue("corrupt epub");
		const ctx = makeCtx();

		// Act

		const actual = await runFileImport([epubFile()], ctx, true);

		// Assert

		expect(actual).toEqual({
			kind: "extraction-failed",
			message: "corrupt epub",
		});
	});

	it("Should extract, normalize, and create a learning asset for a valid markdown file", async () => {
		// Arrange

		vi.mocked(extractMarkdown).mockReturnValue({
			title: "Markdown Title",
			authors: null,
			publicationDate: null,
			html: "<p>markdown content</p>",
		});
		vi.mocked(normalize).mockResolvedValue("<p>normalized</p>");
		const source = makeSource({ id: "source-1" });
		vi.mocked(createBibliographicalSource).mockResolvedValue(source);
		const ctx = makeCtx();

		// Act

		const actual = await runFileImport([markdownFile()], ctx, true);

		// Assert

		expect(actual).toBeNull();
		expect(extractPdf).not.toHaveBeenCalled();
		expect(extractEpub).not.toHaveBeenCalled();
		expect(normalize).toHaveBeenCalledWith("<p>markdown content</p>", {
			baseUrl: null,
		});
		expect(createImportedLearningAsset).toHaveBeenCalledWith(
			ctx,
			"Markdown Title",
			"<p>normalized</p>",
			"source-1",
		);
	});

	it("Should resolve relative links against the location when given one", async () => {
		// Arrange

		vi.mocked(extractMarkdown).mockReturnValue({
			title: "Markdown Title",
			authors: null,
			publicationDate: null,
			html: '<p><img src="diagram.png"></p>',
		});
		vi.mocked(normalize).mockResolvedValue("<p>normalized</p>");
		vi.mocked(createBibliographicalSource).mockResolvedValue(makeSource());
		const ctx = makeCtx();

		// Act

		await runFileImport(
			[markdownFile()],
			ctx,
			true,
			undefined,
			"https://example.com/docs/notes.md",
		);

		// Assert

		expect(normalize).toHaveBeenCalledWith(
			'<p><img src="diagram.png"></p>',
			{
				baseUrl: "https://example.com/docs/notes.md",
			},
		);
	});

	it("Should return no-content when markdown extraction reports no readable content", async () => {
		// Arrange

		vi.mocked(extractMarkdown).mockImplementation(() => {
			throw new Error("no-content");
		});
		const ctx = makeCtx();

		// Act

		const actual = await runFileImport([markdownFile()], ctx, true);

		// Assert

		expect(actual).toEqual({ kind: "no-content" });
	});

	it("Should return extraction-failed with the error message when markdown extraction throws any other error", async () => {
		// Arrange

		vi.mocked(extractMarkdown).mockImplementation(() => {
			throw new Error("bad markdown");
		});
		const ctx = makeCtx();

		// Act

		const actual = await runFileImport([markdownFile()], ctx, true);

		// Assert

		expect(actual).toEqual({
			kind: "extraction-failed",
			message: "bad markdown",
		});
	});

	it("Should extract, normalize, and create a learning asset for an HTML file", async () => {
		// Arrange

		vi.mocked(extractHtml).mockReturnValue({
			title: "Page Title",
			authors: "Jane Doe",
			publicationDate: null,
			html: "<p>html content</p>",
		});
		vi.mocked(normalize).mockResolvedValue("<p>normalized</p>");
		vi.mocked(createBibliographicalSource).mockResolvedValue(makeSource());
		const ctx = makeCtx();

		// Act

		const actual = await runFileImport([htmlFile()], ctx, true);

		// Assert

		expect(actual).toBeNull();
		expect(extractMarkdown).not.toHaveBeenCalled();
		expect(normalize).toHaveBeenCalledWith("<p>html content</p>", {
			baseUrl: null,
		});
		expect(createImportedLearningAsset).toHaveBeenCalledWith(
			ctx,
			"Page Title",
			"<p>normalized</p>",
			"source-1",
		);
	});

	it("Should title a text file after its file name when the extraction has no title", async () => {
		// Arrange

		vi.mocked(extractText).mockReturnValue({
			title: null,
			authors: null,
			publicationDate: null,
			html: "<p>text content</p>",
		});
		vi.mocked(normalize).mockResolvedValue("<p>normalized</p>");
		vi.mocked(createBibliographicalSource).mockResolvedValue(makeSource());
		const ctx = makeCtx();

		// Act

		const actual = await runFileImport([textFile("notes.txt")], ctx, true);

		// Assert

		expect(actual).toBeNull();
		expect(createImportedLearningAsset).toHaveBeenCalledWith(
			ctx,
			"notes",
			"<p>normalized</p>",
			"source-1",
		);
	});

	it("Should import as markdown when a .md file is reported as text/plain", async () => {
		// Arrange

		vi.mocked(extractMarkdown).mockReturnValue({
			title: "Markdown Title",
			authors: null,
			publicationDate: null,
			html: "<p>markdown content</p>",
		});
		vi.mocked(normalize).mockResolvedValue("<p>normalized</p>");
		vi.mocked(createBibliographicalSource).mockResolvedValue(makeSource());
		const ctx = makeCtx();

		// Act

		await runFileImport([textFile("notes.md")], ctx, true);

		// Assert

		expect(extractMarkdown).toHaveBeenCalled();
		expect(extractText).not.toHaveBeenCalled();
	});

	it("Should return extraction-failed with the error message when HTML extraction throws", async () => {
		// Arrange

		vi.mocked(extractHtml).mockImplementation(() => {
			throw new Error("bad html");
		});
		const ctx = makeCtx();

		// Act

		const actual = await runFileImport([htmlFile()], ctx, true);

		// Assert

		expect(actual).toEqual({
			kind: "extraction-failed",
			message: "bad html",
		});
	});

	it("Should open only the last imported file when importing multiple files", async () => {
		// Arrange

		vi.mocked(extractHtml).mockReturnValue({
			title: null,
			authors: null,
			publicationDate: null,
			html: "<p>content</p>",
		});
		vi.mocked(normalize).mockResolvedValue("<p>content</p>");
		vi.mocked(createBibliographicalSource).mockResolvedValue(makeSource());
		vi.mocked(createImportedLearningAsset)
			.mockResolvedValueOnce("first-id")
			.mockResolvedValueOnce("second-id");
		const ctx = makeCtx();

		// Act

		await runFileImport(
			[htmlFile("a.html"), htmlFile("b.html")],
			ctx,
			true,
		);

		// Assert

		expect(ctx.navigate).toHaveBeenCalledOnce();
		expect(ctx.navigate).toHaveBeenCalledWith("/learningAsset/second-id");
	});

	it("Should open the last successfully imported file when a later file fails", async () => {
		// Arrange

		vi.mocked(extractHtml).mockReturnValue({
			title: null,
			authors: null,
			publicationDate: null,
			html: "<p>content</p>",
		});
		vi.mocked(normalize).mockResolvedValue("<p>content</p>");
		vi.mocked(createBibliographicalSource).mockResolvedValue(makeSource());
		vi.mocked(createImportedLearningAsset).mockResolvedValueOnce(
			"first-id",
		);
		const ctx = makeCtx();

		// Act

		const actual = await runFileImport(
			[htmlFile("a.html"), unsupportedFile()],
			ctx,
			true,
		);

		// Assert

		expect(actual).toEqual({ kind: "unsupported-file" });
		expect(ctx.navigate).toHaveBeenCalledOnce();
		expect(ctx.navigate).toHaveBeenCalledWith("/learningAsset/first-id");
	});
});
