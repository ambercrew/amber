import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePdfAnnotationsPersistence } from "../../../../../features/ElementViewer/PdfView/hooks/usePdfAnnotationsPersistence";

const {
	getPdfHighlightsMock,
	updatePdfHighlightsMock,
	useAnnotationCapabilityMock,
} = vi.hoisted(() => ({
	getPdfHighlightsMock: vi.fn(),
	updatePdfHighlightsMock: vi.fn(),
	useAnnotationCapabilityMock: vi.fn(),
}));

vi.mock("../../../../../api/elements/api/elementsApi", () => ({
	getPdfHighlights: getPdfHighlightsMock,
	updatePdfHighlights: updatePdfHighlightsMock,
}));

vi.mock("@embedpdf/plugin-annotation/react", () => ({
	useAnnotationCapability: useAnnotationCapabilityMock,
}));

interface AnnotationEvent {
	type: "loaded" | "create" | "update" | "delete";
	annotation?: { id: string };
	committed?: boolean;
}

/** A stand-in for the per-document `AnnotationScope`, exposing `emit` so
 * tests can drive the annotation events the hook subscribes to. */
function createFakeAnnotationScope() {
	const handlers = new Set<(event: AnnotationEvent) => void>();
	const importAnnotations = vi.fn();
	const exportAnnotations = vi.fn();

	const scope = {
		importAnnotations,
		exportAnnotations,
		onAnnotationEvent: (handler: (event: AnnotationEvent) => void) => {
			handlers.add(handler);
			return () => handlers.delete(handler);
		},
	};

	return {
		scope,
		importAnnotations,
		exportAnnotations,
		emit: (event: AnnotationEvent) =>
			handlers.forEach(handler => handler(event)),
	};
}

const DOCUMENT_ID = "doc-1";
const LEARNING_ASSET_ID = "asset-1";

function renderPersistence(documentId: string | null = DOCUMENT_ID) {
	return renderHook(() =>
		usePdfAnnotationsPersistence(documentId, LEARNING_ASSET_ID),
	);
}

describe("usePdfAnnotationsPersistence", () => {
	let scope: ReturnType<typeof createFakeAnnotationScope>["scope"];
	let importAnnotations: ReturnType<
		typeof createFakeAnnotationScope
	>["importAnnotations"];
	let exportAnnotations: ReturnType<
		typeof createFakeAnnotationScope
	>["exportAnnotations"];
	let emit: ReturnType<typeof createFakeAnnotationScope>["emit"];
	let forDocument: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		const fake = createFakeAnnotationScope();
		scope = fake.scope;
		importAnnotations = fake.importAnnotations;
		exportAnnotations = fake.exportAnnotations;
		emit = fake.emit;
		forDocument = vi.fn(() => scope);
		useAnnotationCapabilityMock.mockReturnValue({
			provides: { forDocument },
		});
		exportAnnotations.mockReturnValue({
			toPromise: () => Promise.resolve([]),
		});
		updatePdfHighlightsMock.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("Should do nothing when the annotation capability isn't ready yet", () => {
		// Arrange

		useAnnotationCapabilityMock.mockReturnValue({ provides: null });
		getPdfHighlightsMock.mockResolvedValue({ highlightsJson: "[]" });

		// Act

		renderPersistence();

		// Assert

		expect(getPdfHighlightsMock).not.toHaveBeenCalled();
	});

	it("Should do nothing when the document isn't ready yet", () => {
		// Arrange

		getPdfHighlightsMock.mockResolvedValue({ highlightsJson: "[]" });

		// Act

		renderPersistence(null);

		// Assert

		expect(getPdfHighlightsMock).not.toHaveBeenCalled();
	});

	it("Should import the learning asset's persisted highlights into the annotation plugin", async () => {
		// Arrange

		const items = [{ annotation: { id: "a1" } }];
		getPdfHighlightsMock.mockResolvedValue({
			highlightsJson: JSON.stringify(items),
		});

		// Act

		await act(async () => {
			renderPersistence();
		});

		// Assert

		expect(forDocument).toHaveBeenCalledWith(DOCUMENT_ID);
		expect(importAnnotations).toHaveBeenCalledWith(items);
	});

	it("Should not save when an imported annotation's own committed event echoes back", async () => {
		// Arrange

		const items = [{ annotation: { id: "a1" } }];
		getPdfHighlightsMock.mockResolvedValue({
			highlightsJson: JSON.stringify(items),
		});
		await act(async () => {
			renderPersistence();
		});

		// Act

		await act(async () => {
			emit({
				type: "create",
				annotation: { id: "a1" },
				committed: true,
			});
		});

		// Assert

		expect(updatePdfHighlightsMock).not.toHaveBeenCalled();
	});

	it("Should save a genuine change once every imported annotation has echoed back", async () => {
		// Arrange

		const items = [
			{ annotation: { id: "a1" } },
			{ annotation: { id: "a2" } },
		];
		getPdfHighlightsMock.mockResolvedValue({
			highlightsJson: JSON.stringify(items),
		});
		exportAnnotations.mockReturnValue({
			toPromise: () => Promise.resolve(items),
		});
		await act(async () => {
			renderPersistence();
		});
		await act(async () => {
			emit({ type: "create", annotation: { id: "a1" }, committed: true });
		});

		// Act

		await act(async () => {
			emit({
				type: "create",
				annotation: { id: "a2" },
				committed: true,
			});
			emit({
				type: "create",
				annotation: { id: "a3" },
				committed: true,
			});
		});

		// Assert

		expect(updatePdfHighlightsMock).toHaveBeenCalledWith({
			learningAssetId: LEARNING_ASSET_ID,
			highlightsJson: JSON.stringify(items),
		});
	});

	it("Should mark itself loaded immediately when there are no persisted highlights", async () => {
		// Arrange

		getPdfHighlightsMock.mockResolvedValue({ highlightsJson: "[]" });

		// Act

		await act(async () => {
			renderPersistence();
		});
		await act(async () => {
			emit({
				type: "create",
				annotation: { id: "new" },
				committed: true,
			});
		});

		// Assert

		expect(importAnnotations).not.toHaveBeenCalled();
		expect(updatePdfHighlightsMock).toHaveBeenCalledWith({
			learningAssetId: LEARNING_ASSET_ID,
			highlightsJson: "[]",
		});
	});

	it("Should not save while the initial highlights haven't finished loading", async () => {
		// Arrange — the fetch never resolves, so `loadedRef` stays false.

		getPdfHighlightsMock.mockReturnValue(new Promise(() => {}));

		// Act

		await act(async () => {
			renderPersistence();
		});
		await act(async () => {
			emit({
				type: "create",
				annotation: { id: "new" },
				committed: true,
			});
		});

		// Assert

		expect(updatePdfHighlightsMock).not.toHaveBeenCalled();
	});

	it("Should ignore the 'loaded' event type", async () => {
		// Arrange

		getPdfHighlightsMock.mockResolvedValue({ highlightsJson: "[]" });
		await act(async () => {
			renderPersistence();
		});

		// Act

		await act(async () => {
			emit({ type: "loaded" });
		});

		// Assert

		expect(updatePdfHighlightsMock).not.toHaveBeenCalled();
	});

	it("Should not save an event that hasn't committed yet", async () => {
		// Arrange

		getPdfHighlightsMock.mockResolvedValue({ highlightsJson: "[]" });
		await act(async () => {
			renderPersistence();
		});

		// Act

		await act(async () => {
			emit({
				type: "create",
				annotation: { id: "new" },
				committed: false,
			});
		});

		// Assert

		expect(updatePdfHighlightsMock).not.toHaveBeenCalled();
	});
});
