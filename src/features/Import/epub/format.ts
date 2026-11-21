import { FileFormat } from "../utils/fileFormat";

// The parser loads on first use, keeping it out of the startup bundle.
export const epubFormat: FileFormat = {
	label: "EPUB",
	extensions: ["epub"],
	mimeTypes: ["application/epub+zip"],
	// ZIP local file header.
	hasSignature: head =>
		head[0] === 0x50 &&
		head[1] === 0x4b &&
		head[2] === 0x03 &&
		head[3] === 0x04,
	extract: async bytes => (await import("./extract")).extractEpub(bytes),
};
