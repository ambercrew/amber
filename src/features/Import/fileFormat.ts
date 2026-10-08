import { PdfProgress } from "./pdf/extract";

export interface FileExtraction {
	title: string | null;
	authors: string | null;
	publicationDate: string | null;
	html: string;
}

/** One importable file type: how to recognize it and how to turn it into HTML. */
export interface FileFormat {
	/** Shown to the user, e.g. in "Only PDF, EPUB, … files are supported". */
	label: string;
	/** Lowercase, without the dot; the first is canonical. */
	extensions: string[];
	/** The first is canonical. */
	mimeTypes: string[];
	/** Magic-byte check for files whose name and type don't reveal the format. */
	hasSignature?: (bytes: Uint8Array) => boolean;
	extract: (
		bytes: ArrayBuffer,
		onProgress?: (progress: PdfProgress) => void,
	) => FileExtraction | Promise<FileExtraction>;
}

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
