import { ElementsFileFormat } from "../fileFormat";
import { importAnki } from "./importAnki";

export const ankiFormat: ElementsFileFormat = {
	label: "Anki",
	// A deck export, or a whole collection's backup.
	extensions: ["apkg", "colpkg"],
	mimeTypes: ["application/x-apkg", "application/x-colpkg"],
	// No signature: it's a ZIP, which EPUB already claims.
	acceptByExtension: true,
	importElements: importAnki,
};
