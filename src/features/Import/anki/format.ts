import { ElementsFileFormat } from "../utils/fileFormat";

// The parser loads on first use, keeping it out of the startup bundle.
export const ankiFormat: ElementsFileFormat = {
	label: "Anki",
	// A deck export, or a whole collection's backup.
	extensions: ["apkg", "colpkg"],
	mimeTypes: ["application/x-apkg", "application/x-colpkg"],
	// No signature: it's a ZIP, which EPUB already claims.
	acceptByExtension: true,
	importElements: async (...args) =>
		(await import("./importAnki")).importAnki(...args),
};
