import {
	importRawPage,
	runUrlImport,
} from "../../../../features/Import/flows/url";
import { fetchPage } from "../../../../api/import/api/importApi";
import { normalize } from "../../../../features/Import/normalize";
import { hydrateLazyImages } from "../../../../features/Import/normalize/hydrateLazyImages";
import { createImportedLearningAsset } from "../../../../features/Import/createImportedLearningAsset";
import { runFileImport } from "../../../../features/Import/flows/file";
import { createBibliographicalSource } from "../../../../api/bibliographicalSources/api/bibliographicalSourcesApi";
import { BibliographicalSourceResponseDto } from "../../../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { ImportContext } from "../../../../features/Import/importContext";
import { AppDispatch, RootState } from "../../../../stores/store";

type Thunk = (dispatch: AppDispatch, getState: () => RootState) => unknown;

vi.mock(import("../../../../api/import/api/importApi"));
vi.mock(import("../../../../features/Import/normalize"));
vi.mock(import("../../../../features/Import/normalize/hydrateLazyImages"));
vi.mock(import("../../../../features/Import/createImportedLearningAsset"));
vi.mock(import("../../../../features/Import/flows/file"));
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
		title: "Article Title",
		authors: null,
		publicationDate: null,
		sourceType: "WebPage",
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
		priorityRank: 5,
	};
}

const ARTICLE_BODY_TEXT =
	"Enough body content to make Defuddle treat this as a real article instead of discarding it as noise. ".repeat(
		5,
	);
const ARTICLE_HTML = `<html><head><title>Article Title</title></head><body><article><h1>Article Title</h1><p>${ARTICLE_BODY_TEXT}</p></article></body></html>`;

describe("runUrlImport", () => {
	it("Should return fetch-failed when fetching the page throws", async () => {
		// Arrange

		vi.mocked(fetchPage).mockRejectedValue(new Error("network down"));
		const ctx = makeCtx();

		// Act

		const actual = await runUrlImport("https://example.com", ctx);

		// Assert

		expect(actual).toEqual({
			kind: "fetch-failed",
			message: "network down",
		});
	});

	it("Should return fetch-failed when the page is neither html, pdf, nor recognized content", async () => {
		// Arrange

		vi.mocked(fetchPage).mockResolvedValue({
			kind: "other",
			finalUrl: "https://example.com",
			contentType: "application/zip",
		});
		const ctx = makeCtx();

		// Act

		const actual = await runUrlImport("https://example.com", ctx);

		// Assert

		expect(actual).toEqual({
			kind: "fetch-failed",
			message: "This link isn't an article or PDF.",
		});
	});

	it("Should delegate to runFileImport when the fetched page is a pdf", async () => {
		// Arrange

		const base64 = btoa("%PDF-1.4 fake");
		vi.mocked(fetchPage).mockResolvedValue({
			kind: "pdf",
			finalUrl: "https://example.com/doc.pdf",
			bytesBase64: base64,
		});
		vi.mocked(runFileImport).mockResolvedValue(null);
		const ctx = makeCtx();

		// Act

		const actual = await runUrlImport("https://example.com/doc.pdf", ctx);

		// Assert

		expect(actual).toBeNull();
		expect(runFileImport).toHaveBeenCalledTimes(1);
		const [files, passedCtx, , location] =
			vi.mocked(runFileImport).mock.calls[0];
		expect(files[0].name).toBe("doc.pdf");
		expect(passedCtx).toBe(ctx);
		expect(location).toBe("https://example.com/doc.pdf");
	});

	it("Should fall back to the requested url when the fetched pdf has no final url", async () => {
		// Arrange

		const base64 = btoa("%PDF-1.4 fake");
		vi.mocked(fetchPage).mockResolvedValue({
			kind: "pdf",
			finalUrl: "",
			bytesBase64: base64,
		});
		vi.mocked(runFileImport).mockResolvedValue(null);
		const ctx = makeCtx();

		// Act

		await runUrlImport("https://example.com/doc.pdf", ctx);

		// Assert

		const [, , , location] = vi.mocked(runFileImport).mock.calls[0];
		expect(location).toBe("https://example.com/doc.pdf");
	});

	it("Should hydrate lazy images before parsing the article", async () => {
		// Arrange

		vi.mocked(fetchPage).mockResolvedValue({
			kind: "html",
			finalUrl: "https://example.com/article",
			text: ARTICLE_HTML,
		});
		vi.mocked(normalize).mockResolvedValue("<p>normalized</p>");
		vi.mocked(createBibliographicalSource).mockResolvedValue(makeSource());
		const ctx = makeCtx();

		// Act

		await runUrlImport("https://example.com/article", ctx);

		// Assert

		expect(hydrateLazyImages).toHaveBeenCalledTimes(1);
	});

	it("Should return no-article with the raw html and source url when Defuddle finds no content", async () => {
		// Arrange

		vi.mocked(fetchPage).mockResolvedValue({
			kind: "html",
			finalUrl: "https://example.com/empty",
			text: "<html><body></body></html>",
		});
		const ctx = makeCtx();

		// Act

		const actual = await runUrlImport("https://example.com/empty", ctx);

		// Assert

		expect(actual).toEqual({
			kind: "no-article",
			rawHtml: "",
			sourceUrl: "https://example.com/empty",
		});
	});

	it("Should fall back to the requested url as the source url when the fetched page has no final url", async () => {
		// Arrange

		vi.mocked(fetchPage).mockResolvedValue({
			kind: "html",
			finalUrl: "",
			text: "<html><body></body></html>",
		});
		const ctx = makeCtx();

		// Act

		const actual = await runUrlImport("https://example.com/empty", ctx);

		// Assert

		expect(actual).toEqual({
			kind: "no-article",
			rawHtml: "",
			sourceUrl: "https://example.com/empty",
		});
	});

	it("Should normalize the extracted article and create a learning asset on success", async () => {
		// Arrange

		vi.mocked(fetchPage).mockResolvedValue({
			kind: "html",
			finalUrl: "https://example.com/article",
			text: ARTICLE_HTML,
		});
		vi.mocked(normalize).mockResolvedValue("<p>normalized</p>");
		const source = makeSource({ id: "source-1" });
		vi.mocked(createBibliographicalSource).mockResolvedValue(source);
		const ctx = makeCtx();

		// Act

		const actual = await runUrlImport("https://example.com/article", ctx);

		// Assert

		expect(actual).toBeNull();
		expect(normalize).toHaveBeenCalledWith(expect.any(String), {
			baseUrl: "https://example.com/article",
		});
		expect(createBibliographicalSource).toHaveBeenCalledWith({
			title: "Article Title",
			authors: null,
			publicationDate: null,
			sourceType: "WebPage",
			location: "https://example.com/article",
		});
		expect(createImportedLearningAsset).toHaveBeenCalledWith(
			ctx,
			"Article Title",
			"<p>normalized</p>",
			"source-1",
		);
	});

	it("Should keep the see also section when importing a wiki page", async () => {
		// Arrange

		const prose = `<p>${ARTICLE_BODY_TEXT}</p>`;
		const wikiHtml = `<html><head><title>Article Title - Wikipedia</title><meta property="og:title" content="Article Title - Wikipedia"></head><body><div id="mw-content-text"><div class="mw-parser-output">${prose}${prose}<div class="mw-heading mw-heading2"><h2 id="See_also">See also</h2></div><ul><li><a href="/wiki/Related">Related</a></li></ul></div></div></body></html>`;
		vi.mocked(fetchPage).mockResolvedValue({
			kind: "html",
			finalUrl: "https://en.wikipedia.org/wiki/Article",
			text: wikiHtml,
		});
		vi.mocked(normalize).mockResolvedValue("<p>normalized</p>");
		vi.mocked(createBibliographicalSource).mockResolvedValue(makeSource());
		const ctx = makeCtx();

		// Act

		await runUrlImport("https://en.wikipedia.org/wiki/Article", ctx);

		// Assert

		const [extracted] = vi.mocked(normalize).mock.calls[0];
		expect(extracted).toContain("See also");
	});

	it("Should fill the source's authors and publication date from the article's byline and published time", async () => {
		// Arrange

		const htmlWithMetadata = `<html><head><title>Article Title</title><meta name="author" content="Jane Doe"><meta property="article:published_time" content="2020-01-01T00:00:00.000Z"></head><body><article><h1>Article Title</h1><p>${ARTICLE_BODY_TEXT}</p></article></body></html>`;
		vi.mocked(fetchPage).mockResolvedValue({
			kind: "html",
			finalUrl: "https://example.com/article",
			text: htmlWithMetadata,
		});
		vi.mocked(normalize).mockResolvedValue("<p>normalized</p>");
		vi.mocked(createBibliographicalSource).mockResolvedValue(makeSource());
		const ctx = makeCtx();

		// Act

		await runUrlImport("https://example.com/article", ctx);

		// Assert

		expect(createBibliographicalSource).toHaveBeenCalledWith({
			title: "Article Title",
			authors: "Jane Doe",
			publicationDate: "2020-01-01T00:00:00.000Z",
			sourceType: "WebPage",
			location: "https://example.com/article",
		});
	});
});

describe("importRawPage", () => {
	it("Should normalize the raw html and create a learning asset with a derived title", async () => {
		// Arrange

		vi.mocked(normalize).mockResolvedValue(
			"<h1>Fallback Title</h1><p>body</p>",
		);
		const source = makeSource({ id: "source-2", title: "Fallback Title" });
		vi.mocked(createBibliographicalSource).mockResolvedValue(source);
		const ctx = makeCtx();

		// Act

		await importRawPage("<div>raw</div>", "https://example.com/raw", ctx);

		// Assert

		expect(normalize).toHaveBeenCalledWith("<div>raw</div>", {
			baseUrl: "https://example.com/raw",
		});
		expect(createBibliographicalSource).toHaveBeenCalledWith({
			title: "Fallback Title",
			authors: null,
			publicationDate: null,
			sourceType: "WebPage",
			location: "https://example.com/raw",
		});
		expect(createImportedLearningAsset).toHaveBeenCalledWith(
			ctx,
			"Fallback Title",
			"<h1>Fallback Title</h1><p>body</p>",
			"source-2",
		);
	});
});
