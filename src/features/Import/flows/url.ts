import Defuddle from "defuddle";
import { fetchPage } from "../../../api/import/api/importApi";
import { createBibliographicalSourceAction } from "../../../stores/bibliographicalSources/bibliographicalSourcesActions";
import errorToString from "../../../utils/errorToString";
import { base64ToArrayBuffer } from "../../../utils/base64ToArrayBuffer";
import { normalize } from "../normalize";
import { hydrateLazyImages } from "../normalize/hydrateLazyImages";
import { hasContent } from "../html/extract";
import { deriveTitle } from "../deriveTitle";
import { createImportedLearningAsset } from "../createImportedLearningAsset";
import { ImportContext } from "../importContext";
import { runFileImport, FileImportError } from "./file";
import { FileFormat, hasExtension } from "../fileFormat";
import { pdfFormat } from "../pdf/format";
import { epubFormat } from "../epub/format";
import { markdownFormat } from "../markdown/format";

export type UrlImportError =
	| { kind: "fetch-failed"; message: string }
	| { kind: "no-article"; rawHtml: string; sourceUrl: string }
	| FileImportError;

export async function runUrlImport(
	url: string,
	ctx: ImportContext,
): Promise<UrlImportError | null> {
	let page;
	try {
		page = await fetchPage(url);
	} catch (err) {
		return { kind: "fetch-failed", message: errorToString(err) };
	}

	const resolvedUrl = page.finalUrl || url;

	if (page.kind === "pdf" || page.kind === "epub") {
		const format = page.kind === "pdf" ? pdfFormat : epubFormat;
		const file = asFile(
			base64ToArrayBuffer(page.bytesBase64),
			resolvedUrl,
			format,
		);
		// URL-imported PDFs have no import-modal toggle to opt out of extraction,
		// so they always convert to an editable document as before.
		return runFileImport([file], ctx, true, undefined, resolvedUrl);
	}

	if (page.kind === "markdown") {
		const file = asFile(page.text, resolvedUrl, markdownFormat);
		return runFileImport([file], ctx, true, undefined, resolvedUrl);
	}

	if (page.kind === "other") {
		return {
			kind: "fetch-failed",
			message: "This link isn't an article, PDF, EPUB or Markdown file.",
		};
	}

	const doc = new DOMParser().parseFromString(page.text, "text/html");
	const base = doc.createElement("base");
	base.href = resolvedUrl;
	doc.head.prepend(base);

	// The fetched HTML is server-rendered, so lazy-loaded images still hold
	// their real URL in a data-* attribute. Promote it to src before
	// Defuddle runs, otherwise Defuddle drops images with no src.
	hydrateLazyImages(doc);

	// Defuddle mutates the document while parsing, so capture the raw markup
	// for the no-article fallback beforehand.
	const rawHtml = doc.body.innerHTML;

	const article = new Defuddle(doc, {
		url: resolvedUrl,
		removeContentPatterns: false,
	}).parse();
	const content = article.content?.trim() ?? "";
	if (!hasContent(content)) {
		return { kind: "no-article", rawHtml, sourceUrl: resolvedUrl };
	}

	await importArticleHtml(
		content,
		article.title || null,
		resolvedUrl,
		ctx,
		article.author || null,
		article.published || null,
	);
	return null;
}

export async function importRawPage(
	rawHtml: string,
	sourceUrl: string,
	ctx: ImportContext,
): Promise<void> {
	await importArticleHtml(rawHtml, null, sourceUrl, ctx);
}

async function importArticleHtml(
	html: string,
	title: string | null,
	baseUrl: string,
	ctx: ImportContext,
	authors: string | null = null,
	publicationDate: string | null = null,
): Promise<void> {
	const content = await normalize(html, { baseUrl });
	const trimmedTitle = title?.trim();
	const finalTitle =
		trimmedTitle && trimmedTitle.length > 0
			? trimmedTitle
			: deriveTitle(content, "");

	const bibliographicalSource = await ctx.dispatch(
		createBibliographicalSourceAction({
			title: finalTitle,
			authors,
			publicationDate,
			sourceType: "WebPage",
			location: baseUrl,
		}),
	);

	await createImportedLearningAsset(
		ctx,
		finalTitle,
		content,
		bibliographicalSource.id,
	);
}

/** Names the fetched file after the URL's last path segment, so runFileImport can title it and detect its type. */
function asFile(content: BlobPart, url: string, format: FileFormat): File {
	let name = "document";
	try {
		name = new URL(url).pathname.split("/").filter(Boolean).pop() ?? name;
		name = decodeURIComponent(name);
	} catch {
		// Keep whatever was parsed so far.
	}
	if (!hasExtension(format, name)) name = `${name}.${format.extensions[0]}`;
	return new File([content], name, { type: format.mimeTypes[0] });
}
