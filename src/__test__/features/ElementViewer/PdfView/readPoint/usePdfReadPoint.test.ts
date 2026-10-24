import { act, renderHook } from "@testing-library/react";
import { runReadingCommand } from "../../../../../commands/readingCommands";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePdfReadPoint } from "../../../../../features/ElementViewer/PdfView/readPoint/usePdfReadPoint";
import { READ_POINT_COLOR } from "../../../../../features/ElementViewer/marks/markLogic";
import { ReadingPosition } from "../../../../../types/elements/readingPosition";

const { updateReadPointMock, useScrollCapabilityMock, notificationsShowMock } =
	vi.hoisted(() => ({
		updateReadPointMock: vi.fn(),
		useScrollCapabilityMock: vi.fn(),
		notificationsShowMock: vi.fn(),
	}));

vi.mock("../../../../../api/elements/api/elementsApi", () => ({
	updateReadPoint: updateReadPointMock,
}));

vi.mock("@embedpdf/plugin-scroll/react", () => ({
	useScrollCapability: useScrollCapabilityMock,
}));

vi.mock("@mantine/notifications", () => ({
	notifications: { show: notificationsShowMock },
}));

// useAutoSave wires itself into the app-close and sync managers (both backed
// by Tauri) on mount. Stub them so the hook exercises only its save/flush
// logic.
vi.mock("../../../../../managers/closeRequestedEventManager", () => ({
	defaultCloseRequestedEventManager: {
		addHandler: vi.fn(),
		removeHandler: vi.fn(),
	},
}));

vi.mock("../../../../../stores/sync/managers/syncEventManager", () => ({
	defaultGlobalSyncEventManager: {
		addListener: vi.fn(),
		removeListener: vi.fn(),
	},
	ListenerType: {
		PreSyncStart: "PreSyncStart",
		PreSyncComplete: "PreSyncComplete",
	},
}));

interface PageChangeEvent {
	documentId: string;
	pageNumber: number;
	totalPages: number;
}

/** A stand-in for `ScrollCapability`, exposing `emitPageChange` so tests can drive the page the hook tracks. */
function createFakeScrollCapability() {
	const pageChangeHandlers = new Set<(event: PageChangeEvent) => void>();
	let currentPage = 1;
	const capability = {
		onPageChange: (handler: (event: PageChangeEvent) => void) => {
			pageChangeHandlers.add(handler);
			return () => pageChangeHandlers.delete(handler);
		},
		getCurrentPage: () => currentPage,
		emitPageChange: (event: PageChangeEvent) => {
			currentPage = event.pageNumber;
			pageChangeHandlers.forEach(handler => handler(event));
		},
	};

	return { capability };
}

const goToPage = vi.fn();

const DOCUMENT_ID = "doc-1";
const LEARNING_ASSET_ID = "r1";

const PAGE_COUNT = 10;

/** Rerenders the last rendered hook as the core does once the first layout is ready. */
let finishLayout: () => void;

function renderPdfReadPoint(overrides: {
	initial: ReadingPosition;
	getMenuPage?: () => number | null;
}) {
	const { initial, getMenuPage } = overrides;
	const rendered = renderHook(
		({ layoutReady }) =>
			usePdfReadPoint({
				learningAssetId: LEARNING_ASSET_ID,
				documentId: DOCUMENT_ID,
				initial,
				layoutReady,
				pageCount: PAGE_COUNT,
				goToPage,
				getCurrentPage: capability.getCurrentPage,
				getMenuPage,
			}),
		{ initialProps: { layoutReady: false } },
	);
	finishLayout = () => rendered.rerender({ layoutReady: true });
	return rendered;
}

let capability: ReturnType<typeof createFakeScrollCapability>["capability"];

describe("usePdfReadPoint", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		updateReadPointMock.mockResolvedValue(undefined);
		const fake = createFakeScrollCapability();
		capability = fake.capability;
		useScrollCapabilityMock.mockReturnValue({ provides: capability });
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it("Should scroll to the saved page when the first layout is ready", () => {
		// Arrange

		renderPdfReadPoint({ initial: { split: 4, block: 0 } });

		// Act

		finishLayout();

		// Assert

		expect(goToPage).toHaveBeenCalledWith(4, {
			behavior: "instant",
			flashColor: READ_POINT_COLOR,
		});
	});

	it("Should clamp the restored page to the document's total page count", () => {
		// Arrange

		renderPdfReadPoint({ initial: { split: 40, block: 0 } });

		// Act

		finishLayout();

		// Assert

		expect(goToPage).toHaveBeenCalledWith(10, {
			behavior: "instant",
			flashColor: READ_POINT_COLOR,
		});
	});

	it("Should not scroll on restore when there is no saved read point", () => {
		// Arrange

		renderPdfReadPoint({ initial: { split: 0, block: 0 } });

		// Act

		finishLayout();

		// Assert

		expect(goToPage).not.toHaveBeenCalled();
	});

	it("Should not scroll when the first layout is not ready yet", () => {
		// Arrange

		// Act

		renderPdfReadPoint({ initial: { split: 4, block: 0 } });

		// Assert

		expect(goToPage).not.toHaveBeenCalled();
	});

	it("Should not persist the current page before the initial restore has landed", async () => {
		// Arrange

		renderPdfReadPoint({ initial: { split: 4, block: 0 } });

		// Act

		await act(async () => {
			capability.emitPageChange({
				documentId: DOCUMENT_ID,
				pageNumber: 6,
				totalPages: 10,
			});
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).not.toHaveBeenCalled();
	});

	it("Should persist the current page after scrolling once restored", async () => {
		// Arrange

		renderPdfReadPoint({ initial: { split: 4, block: 0 } });

		// Act

		finishLayout();
		act(() => {
			capability.emitPageChange({
				documentId: DOCUMENT_ID,
				pageNumber: 6,
				totalPages: 10,
			});
		});
		await act(async () => {
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledWith({
			learningAssetId: LEARNING_ASSET_ID,
			readPoint: { split: 6, block: 0 },
		});
	});

	it("Should not persist a read point identical to the last saved one", async () => {
		// Arrange

		renderPdfReadPoint({ initial: { split: 4, block: 0 } });
		finishLayout();

		// Act

		await act(async () => {
			capability.emitPageChange({
				documentId: DOCUMENT_ID,
				pageNumber: 4,
				totalPages: 10,
			});
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).not.toHaveBeenCalled();
	});

	it("Should persist the right-clicked page when a manual set is requested from the context menu", async () => {
		// Arrange

		renderPdfReadPoint({
			initial: { split: 4, block: 0 },
			getMenuPage: () => 9,
		});
		finishLayout();

		// Act

		await act(async () => {
			runReadingCommand({ type: "set-read-point" });
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledWith({
			learningAssetId: LEARNING_ASSET_ID,
			readPoint: { split: 9, block: 0 },
		});
	});

	it("Should persist the current page when a manual set is requested", async () => {
		// Arrange

		renderPdfReadPoint({ initial: { split: 4, block: 0 } });
		finishLayout();
		act(() => {
			capability.emitPageChange({
				documentId: DOCUMENT_ID,
				pageNumber: 7,
				totalPages: 10,
			});
		});

		// Act

		await act(async () => {
			runReadingCommand({ type: "set-read-point" });
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledWith({
			learningAssetId: LEARNING_ASSET_ID,
			readPoint: { split: 7, block: 0 },
		});
	});

	it("Should stop automatic tracking after a manual set is requested", async () => {
		// Arrange

		renderPdfReadPoint({ initial: { split: 4, block: 0 } });
		finishLayout();
		act(() => {
			capability.emitPageChange({
				documentId: DOCUMENT_ID,
				pageNumber: 7,
				totalPages: 10,
			});
		});
		await act(async () => {
			runReadingCommand({ type: "set-read-point" });
			await vi.runAllTimersAsync();
		});

		// Act

		act(() => {
			capability.emitPageChange({
				documentId: DOCUMENT_ID,
				pageNumber: 9,
				totalPages: 10,
			});
		});
		await act(async () => {
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledTimes(1);
		expect(updateReadPointMock).toHaveBeenCalledWith({
			learningAssetId: LEARNING_ASSET_ID,
			readPoint: { split: 7, block: 0 },
		});
	});

	it("Should clear the read point when a manual clear is requested", async () => {
		// Arrange

		renderPdfReadPoint({ initial: { split: 4, block: 0 } });

		// Act

		await act(async () => {
			runReadingCommand({ type: "clear-read-point" });
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledWith({
			learningAssetId: LEARNING_ASSET_ID,
			readPoint: { split: 0, block: 0 },
		});
	});

	it("Should stop automatic tracking after a manual clear is requested", async () => {
		// Arrange

		renderPdfReadPoint({ initial: { split: 4, block: 0 } });
		finishLayout();
		await act(async () => {
			runReadingCommand({ type: "clear-read-point" });
			await vi.runAllTimersAsync();
		});

		// Act

		await act(async () => {
			capability.emitPageChange({
				documentId: DOCUMENT_ID,
				pageNumber: 9,
				totalPages: 10,
			});
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledTimes(1);
		expect(updateReadPointMock).toHaveBeenCalledWith({
			learningAssetId: LEARNING_ASSET_ID,
			readPoint: { split: 0, block: 0 },
		});
	});

	it("Should show a notification instead of scrolling when a goto is requested with no saved read point", async () => {
		// Arrange

		renderPdfReadPoint({ initial: { split: 0, block: 0 } });

		// Act

		await act(async () => {
			runReadingCommand({ type: "go-to-read-point" });
		});

		// Assert

		expect(notificationsShowMock).toHaveBeenCalledWith({
			message: "No read point set",
		});
		expect(goToPage).not.toHaveBeenCalled();
	});

	it("Should scroll to the saved page when a goto is requested", async () => {
		// Arrange

		renderPdfReadPoint({ initial: { split: 4, block: 0 } });

		// Act

		await act(async () => {
			runReadingCommand({ type: "go-to-read-point" });
		});

		// Assert

		expect(goToPage).toHaveBeenCalledWith(4, {
			flashColor: READ_POINT_COLOR,
		});
	});

	it("Should scroll to the highlight's page when a goto is requested after a highlight is created", async () => {
		// Arrange

		const { result } = renderPdfReadPoint({
			initial: { split: 4, block: 0 },
		});
		await act(async () => {
			result.current.recordExtractReadPoint(9);
			await vi.runAllTimersAsync();
		});

		// Act

		await act(async () => {
			runReadingCommand({ type: "go-to-read-point" });
		});

		// Assert

		expect(goToPage).toHaveBeenLastCalledWith(9, {
			flashColor: READ_POINT_COLOR,
		});
	});

	it("Should persist the read point when a highlight is created", async () => {
		// Arrange

		const { result } = renderPdfReadPoint({
			initial: { split: 1, block: 0 },
		});

		// Act

		await act(async () => {
			result.current.recordExtractReadPoint(6);
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledWith({
			learningAssetId: LEARNING_ASSET_ID,
			readPoint: { split: 6, block: 0 },
		});
	});

	it("Should stop automatic tracking after a highlight is created", async () => {
		// Arrange

		const { result } = renderPdfReadPoint({
			initial: { split: 1, block: 0 },
		});
		finishLayout();
		await act(async () => {
			result.current.recordExtractReadPoint(6);
			await vi.runAllTimersAsync();
		});

		// Act

		act(() => {
			capability.emitPageChange({
				documentId: DOCUMENT_ID,
				pageNumber: 9,
				totalPages: 10,
			});
		});
		await act(async () => {
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledTimes(1);
		expect(updateReadPointMock).toHaveBeenCalledWith({
			learningAssetId: LEARNING_ASSET_ID,
			readPoint: { split: 6, block: 0 },
		});
	});

	it("Should not let a highlight relocate a read point that was already set manually", async () => {
		// Arrange

		const { result } = renderPdfReadPoint({
			initial: { split: 1, block: 0 },
		});
		finishLayout();
		act(() => {
			capability.emitPageChange({
				documentId: DOCUMENT_ID,
				pageNumber: 3,
				totalPages: 10,
			});
		});
		await act(async () => {
			runReadingCommand({ type: "set-read-point" });
			await vi.runAllTimersAsync();
		});

		// Act

		await act(async () => {
			result.current.recordExtractReadPoint(8);
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledTimes(1);
		expect(updateReadPointMock).toHaveBeenCalledWith({
			learningAssetId: LEARNING_ASSET_ID,
			readPoint: { split: 3, block: 0 },
		});
	});

	it("Should let a manual set override a read point that was already set by a highlight", async () => {
		// Arrange

		const { result } = renderPdfReadPoint({
			initial: { split: 1, block: 0 },
		});
		finishLayout();
		act(() => {
			capability.emitPageChange({
				documentId: DOCUMENT_ID,
				pageNumber: 3,
				totalPages: 10,
			});
		});
		await act(async () => {
			result.current.recordExtractReadPoint(8);
			await vi.runAllTimersAsync();
		});

		// Act

		await act(async () => {
			runReadingCommand({ type: "set-read-point" });
			await vi.runAllTimersAsync();
		});

		// Assert

		expect(updateReadPointMock).toHaveBeenCalledTimes(2);
		expect(updateReadPointMock).toHaveBeenLastCalledWith({
			learningAssetId: LEARNING_ASSET_ID,
			readPoint: { split: 3, block: 0 },
		});
	});
});
