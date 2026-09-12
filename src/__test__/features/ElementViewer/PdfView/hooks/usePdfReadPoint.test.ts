import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePdfReadPoint } from "../../../../../features/ElementViewer/PdfView/hooks/usePdfReadPoint";
import { ReadPoint } from "../../../../../types/elements/readPoint";
import { READ_POINT_MANUAL_SET_REQUESTED } from "../../../../../types/events/readPointManualSetRequestedEvent";
import { READ_POINT_MANUAL_CLEAR_REQUESTED } from "../../../../../types/events/readPointManualClearRequestedEvent";
import { READ_POINT_MANUAL_GOTO_REQUESTED } from "../../../../../types/events/readPointManualGotoRequestedEvent";

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

interface LayoutReadyEvent {
	documentId: string;
	isInitial: boolean;
	pageNumber: number;
	totalPages: number;
}

/** A stand-in for `ScrollCapability`, exposing `emitPageChange`/`emitLayoutReady`
 * so tests can drive the event hooks the hook subscribes to. */
function createFakeScrollCapability() {
	const pageChangeHandlers = new Set<(event: PageChangeEvent) => void>();
	const layoutReadyHandlers = new Set<(event: LayoutReadyEvent) => void>();
	const scrollToPage = vi.fn();

	const capability = {
		forDocument: vi.fn(() => ({ scrollToPage })),
		onPageChange: (handler: (event: PageChangeEvent) => void) => {
			pageChangeHandlers.add(handler);
			return () => pageChangeHandlers.delete(handler);
		},
		onLayoutReady: (handler: (event: LayoutReadyEvent) => void) => {
			layoutReadyHandlers.add(handler);
			return () => layoutReadyHandlers.delete(handler);
		},
		emitPageChange: (event: PageChangeEvent) =>
			pageChangeHandlers.forEach(handler => handler(event)),
		emitLayoutReady: (event: LayoutReadyEvent) =>
			layoutReadyHandlers.forEach(handler => handler(event)),
	};

	return { capability, scrollToPage };
}

const DOCUMENT_ID = "doc-1";
const LEARNING_ASSET_ID = "r1";

function renderPdfReadPoint(overrides: {
	initial: ReadPoint;
	documentId?: string | null;
	learningAssetId?: string;
}) {
	const {
		initial,
		documentId = DOCUMENT_ID,
		learningAssetId = LEARNING_ASSET_ID,
	} = overrides;
	return renderHook(() =>
		usePdfReadPoint({ learningAssetId, documentId, initial }),
	);
}

describe("usePdfReadPoint", () => {
	let capability: ReturnType<typeof createFakeScrollCapability>["capability"];
	let scrollToPage: ReturnType<
		typeof createFakeScrollCapability
	>["scrollToPage"];

	beforeEach(() => {
		vi.useFakeTimers();
		updateReadPointMock.mockResolvedValue(undefined);
		const fake = createFakeScrollCapability();
		capability = fake.capability;
		scrollToPage = fake.scrollToPage;
		useScrollCapabilityMock.mockReturnValue({ provides: capability });
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it("Should scroll to the saved page once the initial layout is ready", () => {
		// Arrange

		renderPdfReadPoint({ initial: { split: 4, block: 0 } });

		// Act

		act(() => {
			capability.emitLayoutReady({
				documentId: DOCUMENT_ID,
				isInitial: true,
				pageNumber: 1,
				totalPages: 10,
			});
		});

		// Assert

		expect(scrollToPage).toHaveBeenCalledWith({
			pageNumber: 4,
			behavior: "instant",
		});
	});

	it("Should clamp the restored page to the document's total page count", () => {
		// Arrange

		renderPdfReadPoint({ initial: { split: 40, block: 0 } });

		// Act

		act(() => {
			capability.emitLayoutReady({
				documentId: DOCUMENT_ID,
				isInitial: true,
				pageNumber: 1,
				totalPages: 10,
			});
		});

		// Assert

		expect(scrollToPage).toHaveBeenCalledWith({
			pageNumber: 10,
			behavior: "instant",
		});
	});

	it("Should not scroll on restore when there is no saved read point", () => {
		// Arrange

		renderPdfReadPoint({ initial: { split: 0, block: 0 } });

		// Act

		act(() => {
			capability.emitLayoutReady({
				documentId: DOCUMENT_ID,
				isInitial: true,
				pageNumber: 1,
				totalPages: 10,
			});
		});

		// Assert

		expect(scrollToPage).not.toHaveBeenCalled();
	});

	it("Should ignore a layout-ready event for a different document", () => {
		// Arrange

		renderPdfReadPoint({ initial: { split: 4, block: 0 } });

		// Act

		act(() => {
			capability.emitLayoutReady({
				documentId: "some-other-doc",
				isInitial: true,
				pageNumber: 1,
				totalPages: 10,
			});
		});

		// Assert

		expect(scrollToPage).not.toHaveBeenCalled();
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

		act(() => {
			capability.emitLayoutReady({
				documentId: DOCUMENT_ID,
				isInitial: true,
				pageNumber: 4,
				totalPages: 10,
			});
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
		act(() => {
			capability.emitLayoutReady({
				documentId: DOCUMENT_ID,
				isInitial: true,
				pageNumber: 4,
				totalPages: 10,
			});
		});

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

	it("Should persist the current page when a manual set is requested", async () => {
		// Arrange

		renderPdfReadPoint({ initial: { split: 4, block: 0 } });
		act(() => {
			capability.emitLayoutReady({
				documentId: DOCUMENT_ID,
				isInitial: true,
				pageNumber: 4,
				totalPages: 10,
			});
			capability.emitPageChange({
				documentId: DOCUMENT_ID,
				pageNumber: 7,
				totalPages: 10,
			});
		});

		// Act

		await act(async () => {
			window.dispatchEvent(new Event(READ_POINT_MANUAL_SET_REQUESTED));
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
		act(() => {
			capability.emitLayoutReady({
				documentId: DOCUMENT_ID,
				isInitial: true,
				pageNumber: 4,
				totalPages: 10,
			});
			capability.emitPageChange({
				documentId: DOCUMENT_ID,
				pageNumber: 7,
				totalPages: 10,
			});
		});
		await act(async () => {
			window.dispatchEvent(new Event(READ_POINT_MANUAL_SET_REQUESTED));
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
			window.dispatchEvent(new Event(READ_POINT_MANUAL_CLEAR_REQUESTED));
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
		act(() => {
			capability.emitLayoutReady({
				documentId: DOCUMENT_ID,
				isInitial: true,
				pageNumber: 4,
				totalPages: 10,
			});
		});
		await act(async () => {
			window.dispatchEvent(new Event(READ_POINT_MANUAL_CLEAR_REQUESTED));
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
			window.dispatchEvent(new Event(READ_POINT_MANUAL_GOTO_REQUESTED));
		});

		// Assert

		expect(notificationsShowMock).toHaveBeenCalledWith({
			message: "No read point set",
		});
		expect(scrollToPage).not.toHaveBeenCalled();
	});

	it("Should scroll to the saved page when a goto is requested", async () => {
		// Arrange

		renderPdfReadPoint({ initial: { split: 4, block: 0 } });

		// Act

		await act(async () => {
			window.dispatchEvent(new Event(READ_POINT_MANUAL_GOTO_REQUESTED));
		});

		// Assert

		expect(scrollToPage).toHaveBeenCalledWith({
			pageNumber: 4,
			behavior: "smooth",
		});
	});

	it("Should persist the read point when a highlight is created", async () => {
		// Arrange

		const { result } = renderPdfReadPoint({
			initial: { split: 1, block: 0 },
		});

		// Act

		await act(async () => {
			result.current.recordHighlightReadPoint(5);
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
		act(() => {
			capability.emitLayoutReady({
				documentId: DOCUMENT_ID,
				isInitial: true,
				pageNumber: 1,
				totalPages: 10,
			});
		});
		await act(async () => {
			result.current.recordHighlightReadPoint(5);
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
		act(() => {
			capability.emitLayoutReady({
				documentId: DOCUMENT_ID,
				isInitial: true,
				pageNumber: 1,
				totalPages: 10,
			});
			capability.emitPageChange({
				documentId: DOCUMENT_ID,
				pageNumber: 3,
				totalPages: 10,
			});
		});
		await act(async () => {
			window.dispatchEvent(new Event(READ_POINT_MANUAL_SET_REQUESTED));
			await vi.runAllTimersAsync();
		});

		// Act

		await act(async () => {
			result.current.recordHighlightReadPoint(7);
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
		act(() => {
			capability.emitLayoutReady({
				documentId: DOCUMENT_ID,
				isInitial: true,
				pageNumber: 1,
				totalPages: 10,
			});
			capability.emitPageChange({
				documentId: DOCUMENT_ID,
				pageNumber: 3,
				totalPages: 10,
			});
		});
		await act(async () => {
			result.current.recordHighlightReadPoint(7);
			await vi.runAllTimersAsync();
		});

		// Act

		await act(async () => {
			window.dispatchEvent(new Event(READ_POINT_MANUAL_SET_REQUESTED));
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
