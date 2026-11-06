import { ElementId } from "../../types/elements/elementId";
import { ImportContext } from "./importContext";
import { PdfProgress } from "./pdf/extract";

export interface FileExtraction {
	title: string | null;
	authors: string | null;
	publicationDate: string | null;
	html: string;
}

interface FileFormatBase {
	/** Shown to the user, e.g. in "Only PDF, EPUB, … files are supported". */
	label: string;
	/** Lowercase, without the dot; the first is canonical. */
	extensions: string[];
	/** The first is canonical. */
	mimeTypes: string[];
	/** Magic-byte check for files whose name and type don't reveal the format. */
	hasSignature?: (bytes: Uint8Array) => boolean;
	/** Also accept files by extension: OSes don't know this type, so it arrives empty. */
	acceptByExtension?: boolean;
}

/** A file type turned into one learning asset via its HTML. */
export interface DocumentFileFormat extends FileFormatBase {
	extract: (
		bytes: ArrayBuffer,
		onProgress?: (progress: PdfProgress) => void,
	) => FileExtraction | Promise<FileExtraction>;
}

/** A file type turned into elements of its own, e.g. a deck's folders and cards. */
export interface ElementsFileFormat extends FileFormatBase {
	/** Resolves to the element to open afterwards, if any. */
	importElements: (
		bytes: ArrayBuffer,
		ctx: ImportContext,
		bibliographicalSourceId: string,
	) => Promise<ElementId | null>;
}

/** One importable file type: how to recognize it and how to import it. */
export type FileFormat = DocumentFileFormat | ElementsFileFormat;

export function hasExtension(format: FileFormat, name: string): boolean {
	const dot = name.lastIndexOf(".");
	return (
		dot >= 0 &&
		format.extensions.includes(name.slice(dot + 1).toLowerCase())
	);
}

/** Matches by name or reported type only, for when the bytes aren't read yet. */
export function matchesFile(format: FileFormat, file: File): boolean {
	return (
		hasExtension(format, file.name) || format.mimeTypes.includes(file.type)
	);
}
