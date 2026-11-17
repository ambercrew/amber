import { ReadPointSource } from "../elements/readPointSource";
import { PdfViewPosition } from "../elements/pdfViewPosition";
import { ViewPosition } from "../elements/viewPosition";

/** How the element under review was left, so Return can pick up there: where it was scrolled, and its read point precedence. */
export interface ReviewResume {
	learningAssetId: string;
	viewPosition?: ViewPosition;
	pdfViewPosition?: PdfViewPosition;
	readPointSource?: ReadPointSource;
}
