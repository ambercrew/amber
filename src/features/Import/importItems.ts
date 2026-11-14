import errorToString from "../../utils/errorToString";
import { detectFileFormatByName, SUPPORTED_FORMATS_ALL } from "./fileFormats";
import { ImportContext } from "./importContext";
import { ImportResult } from "./importResult";
import { FileFormat } from "./fileFormat";
import { PdfProgress } from "./pdf/extract";
import { pdfFormat } from "./pdf/format";
import { runContentImport } from "./flows/content";
import { FileImportError, runFileImport } from "./flows/file";
import { importRawPage, runUrlImport, UrlImportError } from "./flows/url";

/** One thing staged in the import modal, imported in order with the others. */
export type ImportItem =
	| {
			kind: "file";
			key: string;
			file: File;
			/** Detected from the name when staged; `null` if unrecognized. */
			format: FileFormat | null;
			extractPdf: boolean;
	  }
	| { kind: "url"; key: string; url: string }
	| { kind: "content"; key: string; html: string | null; text: string }
	/** A link whose article couldn't be found, imported as its whole page. */
	| { kind: "raw"; key: string; rawHtml: string; sourceUrl: string };

export interface ImportItemError {
	message: string;
	/** Set when the page can still be imported whole. */
	rawPage?: { rawHtml: string; sourceUrl: string };
}

/** Identifies a file by name, size and modification time, since `File` has no stable id. */
export function fileKey(file: File): string {
	return `${file.name}|${file.size}|${file.lastModified}`;
}

/** Appends files to the staged items, skipping any already staged; PDFs get their text extracted by default. */
export function addFiles(items: ImportItem[], files: File[]): ImportItem[] {
	return addItems(
		items,
		files.map(file => ({
			kind: "file",
			key: `file:${fileKey(file)}`,
			file,
			format: detectFileFormatByName(file),
			extractPdf: true,
		})),
	);
}

export function addUrl(items: ImportItem[], url: string): ImportItem[] {
	return addItems(items, [{ kind: "url", key: `url:${url}`, url }]);
}

export function addContent(
	items: ImportItem[],
	html: string | null,
	text: string,
): ImportItem[] {
	return addItems(items, [
		{ kind: "content", key: `content:${crypto.randomUUID()}`, html, text },
	]);
}

function addItems(items: ImportItem[], added: ImportItem[]): ImportItem[] {
	const keys = new Set(items.map(item => item.key));
	const fresh = added.filter(item => {
		if (keys.has(item.key)) return false;
		keys.add(item.key);
		return true;
	});
	return fresh.length > 0 ? [...items, ...fresh] : items;
}

export function isPdfItem(item: ImportItem): boolean {
	return item.kind === "file" && item.format === pdfFormat;
}

/** What a staged item shows as its name and kind, e.g. "notes.md" and "Markdown". */
export function describeItem(item: ImportItem): {
	title: string;
	subtitle: string;
} {
	switch (item.kind) {
		case "file":
			return {
				title: item.file.name,
				subtitle: item.format?.label ?? "File",
			};
		case "url":
		case "raw": {
			const url = item.kind === "url" ? item.url : item.sourceUrl;
			return {
				title: displayUrl(url),
				subtitle: item.kind === "url" ? "Web page" : "Whole web page",
			};
		}
		case "content":
			return {
				title: item.text.trim().split("\n")[0] || "Pasted content",
				subtitle: "Pasted content",
			};
	}
}

/** Drops the scheme and trailing slash, e.g. "jqlang.org/manual". */
function displayUrl(url: string): string {
	return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** Imports one item; resolves to the element it created, or the error that stopped it. */
export async function runImportItem(
	item: ImportItem,
	ctx: ImportContext,
	onProgress: (progress: PdfProgress) => void,
): Promise<ImportResult<ImportItemError>> {
	try {
		switch (item.kind) {
			case "file":
				return describeFailure(
					await runFileImport(
						item.file,
						ctx,
						item.extractPdf,
						onProgress,
					),
				);
			case "url":
				return describeFailure(await runUrlImport(item.url, ctx));
			case "content":
				return { ok: true, created: await runContentImport(item, ctx) };
			case "raw":
				return {
					ok: true,
					created: await importRawPage(
						item.rawHtml,
						item.sourceUrl,
						ctx,
					),
				};
		}
	} catch (err) {
		return { ok: false, error: { message: errorToString(err) } };
	}
}

function describeFailure(
	result: ImportResult<UrlImportError | FileImportError>,
): ImportResult<ImportItemError> {
	return result.ok
		? result
		: { ok: false, error: describeError(result.error) };
}

function describeError(
	error: UrlImportError | FileImportError,
): ImportItemError {
	switch (error.kind) {
		case "fetch-failed":
			return { message: error.message };
		case "no-article":
			return {
				message: "Couldn't extract an article from this page.",
				rawPage: { rawHtml: error.rawHtml, sourceUrl: error.sourceUrl },
			};
		case "unsupported-file":
			return {
				message: `Only ${SUPPORTED_FORMATS_ALL} files are supported.`,
			};
		case "no-text-layer":
			return { message: "This PDF has no selectable text." };
		case "no-content":
			return { message: "This file has no readable content." };
		case "extraction-failed":
			return { message: error.message };
	}
}
