import { getPdfPageCount, PdfProgress } from "../pdf/extract";
import { pdfFormat } from "../pdf/format";
import { detectFileFormat } from "../fileFormats";
import { normalize } from "../normalize";
import { createImportedLearningAsset } from "../createImportedLearningAsset";
import { createImportedPdfLearningAsset } from "../createImportedPdfLearningAsset";
import { createBibliographicalSourceAction } from "../../../stores/bibliographicalSources/bibliographicalSourcesActions";
import { ImportContext } from "../importContext";
import errorToString from "../../../utils/errorToString";
import { bytesToBase64 } from "../../../utils/bytesToBase64";

export type FileImportError =
	| { kind: "unsupported-file" }
	| { kind: "no-text-layer" }
	| { kind: "no-content" }
	| { kind: "extraction-failed"; message: string };

const TITLE_SUFFIX_PATTERN =
	/\.(docx?|pdf|pptx?|xlsx?|epub|md|markdown|x?html?|txt)$/i;

export async function runFileImport(
	files: File[],
	ctx: ImportContext,
	extractPdfContent: boolean,
	onProgress?: (progress: PdfProgress) => void,
	location?: string | null,
): Promise<FileImportError | null> {
	for (const file of files) {
		const bytes = await file.arrayBuffer();
		const format = detectFileFormat(file, bytes);
		if (format === null) return { kind: "unsupported-file" };

		const title = file.name.replace(TITLE_SUFFIX_PATTERN, "");

		try {
			if (format === pdfFormat && !extractPdfContent) {
				const pageCount = await getPdfPageCount(bytes);
				const bibliographicalSource = await ctx.dispatch(
					createBibliographicalSourceAction({
						title: file.name,
						authors: null,
						publicationDate: null,
						sourceType: "File",
						location: location ?? file.name,
					}),
				);
				await createImportedPdfLearningAsset(
					ctx,
					title,
					bytesToBase64(new Uint8Array(bytes)),
					pageCount,
					bibliographicalSource.id,
				);
				continue;
			}

			const extraction = await format.extract(bytes, onProgress);
			// A URL import passes its URL, so relative links and images resolve against it.
			const content = await normalize(extraction.html, {
				baseUrl: location ?? null,
			});
			const resolvedTitle = plausibleTitle(extraction.title) ?? title;

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
				resolvedTitle,
				content,
				bibliographicalSource.id,
			);
		} catch (err) {
			const message = errorToString(err);
			if (message === "no-text-layer") {
				return { kind: "no-text-layer" };
			}
			if (message === "no-content") {
				return { kind: "no-content" };
			}
			return { kind: "extraction-failed", message };
		}
	}

	return null;
}

function plausibleTitle(title: string | null): string | null {
	if (!title) return null;
	const trimmed = title.trim();
	if (trimmed.length === 0) return null;
	if (/^untitled$/i.test(trimmed)) return null;
	if (TITLE_SUFFIX_PATTERN.test(trimmed)) return null;
	return trimmed;
}
