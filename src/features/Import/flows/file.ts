import { extractPdf, PdfProgress } from "../pdf/extract";
import { extractEpub } from "../epub/extract";
import { extractMarkdown } from "../markdown/extract";
import { normalize } from "../normalize";
import { createImportedLearningAsset } from "../createImportedLearningAsset";
import { createBibliographicalSourceAction } from "../../../stores/bibliographicalSources/bibliographicalSourcesActions";
import { ImportContext } from "../importContext";

export type FileImportError =
	| { kind: "unsupported-file" }
	| { kind: "no-text-layer" }
	| { kind: "no-content" }
	| { kind: "pdf-failed"; message: string }
	| { kind: "epub-failed"; message: string }
	| { kind: "markdown-failed"; message: string };

const TITLE_SUFFIX_PATTERN = /\.(docx?|pdf|pptx?|xlsx?|epub|md|markdown)$/i;

export async function runFileImport(
	files: File[],
	ctx: ImportContext,
	onProgress?: (progress: PdfProgress) => void,
	location?: string | null,
): Promise<FileImportError | null> {
	for (const file of files) {
		const bytes = await file.arrayBuffer();
		const isPdf = hasPdfMagic(bytes);
		const isEpub = !isPdf && hasEpubMagic(bytes);
		const isMarkdown = !isPdf && !isEpub && hasMarkdownExtension(file.name);
		if (!isPdf && !isEpub && !isMarkdown)
			return { kind: "unsupported-file" };

		try {
			const extraction = isPdf
				? await extractPdf(bytes, onProgress)
				: isEpub
					? await extractEpub(bytes)
					: extractMarkdown(new TextDecoder().decode(bytes));
			const content = await normalize(extraction.html, { baseUrl: null });
			const title =
				plausibleTitle(extraction.title) ??
				file.name.replace(TITLE_SUFFIX_PATTERN, "");

			const bibliographicalSource = await ctx.dispatch(
				createBibliographicalSourceAction({
					title: file.name,
					authors: extraction.authors,
					publicationDate: extraction.publicationDate,
					sourceType: "File",
					location: location ?? file.name,
				}),
			);

			await createImportedLearningAsset(
				ctx,
				title,
				content,
				bibliographicalSource.id,
			);
		} catch (err) {
			if (err instanceof Error && err.message === "no-text-layer") {
				return { kind: "no-text-layer" };
			}
			if (err instanceof Error && err.message === "no-content") {
				return { kind: "no-content" };
			}
			return {
				kind: isPdf
					? "pdf-failed"
					: isEpub
						? "epub-failed"
						: "markdown-failed",
				message: err instanceof Error ? err.message : String(err),
			};
		}
	}

	return null;
}

function hasPdfMagic(bytes: ArrayBuffer): boolean {
	const head = new Uint8Array(bytes.slice(0, 5));
	return String.fromCharCode(...head) === "%PDF-";
}

function hasEpubMagic(bytes: ArrayBuffer): boolean {
	const head = new Uint8Array(bytes.slice(0, 4));
	return (
		head.length === 4 &&
		head[0] === 0x50 &&
		head[1] === 0x4b &&
		head[2] === 0x03 &&
		head[3] === 0x04
	);
}

function hasMarkdownExtension(name: string): boolean {
	return /\.(md|markdown)$/i.test(name);
}

function plausibleTitle(title: string | null): string | null {
	if (!title) return null;
	const trimmed = title.trim();
	if (trimmed.length === 0) return null;
	if (/^untitled$/i.test(trimmed)) return null;
	if (TITLE_SUFFIX_PATTERN.test(trimmed)) return null;
	return trimmed;
}
