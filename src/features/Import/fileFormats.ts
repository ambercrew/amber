import { FileFormat, hasExtension } from "./fileFormat";
import { pdfFormat } from "./pdf/format";
import { epubFormat } from "./epub/format";
import { markdownFormat } from "./markdown/format";
import { htmlFormat } from "./html/format";
import { textFormat } from "./text/format";
import { docxFormat } from "./docx/format";

export const FILE_FORMATS: FileFormat[] = [
	pdfFormat,
	epubFormat,
	docxFormat,
	markdownFormat,
	htmlFormat,
	textFormat,
];

// Extension beats reported type: OSes often report `.md` files as `text/plain`.
export function detectFileFormat(
	file: File,
	bytes: ArrayBuffer,
): FileFormat | null {
	const head = new Uint8Array(bytes.slice(0, 64));
	return (
		FILE_FORMATS.find(format => hasExtension(format, file.name)) ??
		FILE_FORMATS.find(format => format.hasSignature?.(head)) ??
		FILE_FORMATS.find(format => format.mimeTypes.includes(file.type)) ??
		null
	);
}

// MIME types only: Linux pickers list bare extensions as unlabeled filters like "*.pdf ()".
export const FILE_FORMATS_ACCEPT: string[] = FILE_FORMATS.flatMap(
	format => format.mimeTypes,
);

const labels = FILE_FORMATS.map(format => format.label);

/** e.g. "PDF, EPUB, and text" */
export const SUPPORTED_FORMATS_ALL = joinLabels("and");

/** e.g. "PDF, EPUB, or text" */
export const SUPPORTED_FORMATS_ANY = joinLabels("or");

function joinLabels(conjunction: string): string {
	return `${labels.slice(0, -1).join(", ")}, ${conjunction} ${labels[labels.length - 1]}`;
}
