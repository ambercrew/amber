import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImportModal from "../../../../features/Import/components/ImportModal";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { runFileImport } from "../../../../features/Import/flows/file";
import { runUrlImport } from "../../../../features/Import/flows/url";
import {
	getElementMeta,
	getPriorityPositionForNewElement,
} from "../../../../api/elements/api/elementsApi";
import {
	AnyElementDto,
	MetaResponseDto,
} from "../../../../api/elements/dto/anyElementDto";
import { openImportedElement } from "../../../../features/Import/utils/openImportedElement";
import { ReactElement } from "react";
import { cleanNotifications, notificationsStore } from "@mantine/notifications";
import { MantineProvider } from "@mantine/core";
import { openImportModal } from "../../../../stores/app/appReducer";
import { AppStore } from "../../../../stores/store";

vi.mock(import("../../../../features/Import/flows/file"));
vi.mock(import("../../../../features/Import/flows/url"));
vi.mock(import("../../../../api/elements/api/elementsApi.ts"));
vi.mock(import("../../../../features/Import/utils/openImportedElement"));

const NO_TEXT_LAYER = {
	ok: false as const,
	error: { kind: "no-text-layer" as const },
};

function created(id: string) {
	return {
		ok: true as const,
		created: { type: "learningAsset" as const, id },
	};
}

function pdfFile(name: string) {
	return new File(["%PDF-1.4"], name, { type: "application/pdf" });
}

function pasteText(input: HTMLElement, text: string) {
	fireEvent.paste(input, {
		clipboardData: {
			files: [],
			items: [],
			types: ["text/plain"],
			getData: (type: string) => (type === "text/plain" ? text : ""),
		},
	});
}

function pasteFiles(input: HTMLElement, files: File[]) {
	fireEvent.paste(input, {
		clipboardData: {
			files,
			types: ["Files"],
			getData: () => "",
		},
	});
}

const FOLDER_META: MetaResponseDto = {
	elementId: { type: "folder", id: "folder-1" },
	name: "History",
	nameSource: "manual",
	parent: null,
	position: "a",
	tags: ["rome", "greece"].map(name => ({
		name,
		createdAt: "",
		modifiedAt: "",
	})),
	createdAt: "",
	modifiedAt: "",
	bibliographicalSourceId: null,
	derivedFrom: null,
};

async function renderOpenedModal(currentElement: AnyElementDto | null = null) {
	const result = renderWithProviders(<ImportModal />, {
		preloadedState: {
			elements: {
				tree: [],
				isLoading: false,
				error: null,
				currentElement,
				zoomOwnedByCurrentView: false,
			},
			app: {
				startedInitialStateLoading: false,
				importModalOpened: true,
				studyProfileModalOpened: false,
				settingsModalOpened: false,
				priorityModalOpened: false,
				dueDateModalOpened: false,
				shortcutsModalOpened: false,
				aiPromptLibraryModalOpened: false,
				aiPromptLibraryNewPromptRequest: 0,
				studySessionSettingsModalOpened: false,
				authModalOpened: false,
				authModalInitialTab: "sign-in",
				verifyEmailModalOpened: false,
				manageAccountModalOpened: false,
				virtualKeyboardSuppressed: false,
				pendingFocus: null,
				mainScrollPinned: true,
				headroomOverride: null,
				pendingTreeReveal: null,
				lastPriorityPreview: null,
			},
		},
	});

	// The modal reads the priority-queue size as soon as it opens; let that
	// settle here so the state update it triggers doesn't land outside act().
	await act(async () => {
		/* Empty */
	});

	return result;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(r => (resolve = r));
	return { promise, resolve };
}

/** Starts importing one PDF whose import waits on the returned `finish`, then closes the modal. */
async function closeDuringImport() {
	const pending = deferred<Awaited<ReturnType<typeof runFileImport>>>();
	vi.mocked(runFileImport).mockReturnValueOnce(pending.promise);
	const { store } = await renderOpenedModal();
	pasteFiles(screen.getByPlaceholderText("Paste a link or content"), [
		pdfFile("article.pdf"),
	]);
	fireEvent.click(screen.getByRole("button", { name: "Import" }));
	await screen.findByText("Importing…");
	fireEvent.click(screen.getByRole("button", { name: "Close" }));
	return { store, finish: pending.resolve };
}

function shownNotifications() {
	return notificationsStore.getState().notifications;
}

/** Renders a notification's message on its own, so its button can be clicked. */
function renderNotificationMessage(index: number) {
	render(
		<MantineProvider>
			{shownNotifications()[index].message as ReactElement}
		</MantineProvider>,
	);
}

function isModalOpened(store: AppStore) {
	return store.getState().app.importModalOpened;
}

describe("ImportModal", () => {
	afterEach(() => {
		act(() => cleanNotifications());
	});

	beforeEach(() => {
		vi.mocked(getPriorityPositionForNewElement).mockResolvedValue({
			position: 5,
			total: 10,
		});
		vi.mocked(runFileImport).mockResolvedValue({ ok: true, created: null });
		vi.mocked(runUrlImport).mockResolvedValue({ ok: true, created: null });
	});

	it("Should stage the file without starting import when a file is pasted", async () => {
		// Arrange

		await renderOpenedModal();
		const input = screen.getByPlaceholderText("Paste a link or content");
		const file = pdfFile("article.pdf");

		// Act

		pasteFiles(input, [file]);

		// Assert

		expect(screen.getByText("article.pdf")).toBeInTheDocument();
		expect(runFileImport).not.toHaveBeenCalled();
	});

	it("Should start file import only when Import is clicked", async () => {
		// Arrange

		await renderOpenedModal();
		const input = screen.getByPlaceholderText("Paste a link or content");
		const file = pdfFile("article.pdf");
		pasteFiles(input, [file]);

		// Act

		fireEvent.click(screen.getByRole("button", { name: "Import" }));

		// Assert

		await waitFor(() => {
			expect(runFileImport).toHaveBeenCalledWith(
				file,
				expect.anything(),
				true,
				expect.any(Function),
			);
		});
	});

	it("Should show one row per file when multiple files are pasted", async () => {
		// Arrange

		await renderOpenedModal();
		const input = screen.getByPlaceholderText("Paste a link or content");
		const files = [pdfFile("first.pdf"), pdfFile("second.pdf")];

		// Act

		pasteFiles(input, files);

		// Assert

		expect(screen.getByText("first.pdf")).toBeInTheDocument();
		expect(screen.getByText("second.pdf")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Remove first.pdf" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Remove second.pdf" }),
		).toBeInTheDocument();
	});

	it("Should remove only the targeted file when its remove button is clicked", async () => {
		// Arrange

		await renderOpenedModal();
		const input = screen.getByPlaceholderText("Paste a link or content");
		pasteFiles(input, [pdfFile("first.pdf"), pdfFile("second.pdf")]);

		// Act

		fireEvent.click(
			screen.getByRole("button", { name: "Remove first.pdf" }),
		);

		// Assert

		expect(screen.queryByText("first.pdf")).not.toBeInTheDocument();
		expect(screen.getByText("second.pdf")).toBeInTheDocument();
	});

	it("Should show the error message immediately while a failed file is still staged", async () => {
		// Arrange

		vi.mocked(runFileImport).mockResolvedValue({
			ok: false,
			error: { kind: "no-text-layer" },
		});
		await renderOpenedModal();
		const input = screen.getByPlaceholderText("Paste a link or content");
		const file = pdfFile("article.pdf");
		pasteFiles(input, [file]);

		// Act

		fireEvent.click(screen.getByRole("button", { name: "Import" }));

		// Assert

		expect(
			await screen.findByText("This PDF has no selectable text."),
		).toBeInTheDocument();
		expect(screen.getByText("article.pdf")).toBeInTheDocument();
	});

	it("Should revert to the link input when the last staged file is removed", async () => {
		// Arrange

		await renderOpenedModal();
		const input = screen.getByPlaceholderText("Paste a link or content");
		pasteFiles(input, [pdfFile("article.pdf")]);

		// Act

		fireEvent.click(
			screen.getByRole("button", { name: "Remove article.pdf" }),
		);

		// Assert

		expect(screen.queryByText("article.pdf")).not.toBeInTheDocument();
		expect(
			screen.getByPlaceholderText("Paste a link or content"),
		).toBeInTheDocument();
	});

	it("Should list the supported file formats when nothing is staged", async () => {
		// Arrange

		// Act

		await renderOpenedModal();

		// Assert

		expect(screen.getByText("Choose files")).toBeInTheDocument();
		expect(screen.getByText("EPUB")).toBeInTheDocument();
		expect(screen.getByText("Anki")).toBeInTheDocument();
	});

	it("Should import a PDF as a PDF when Keep as PDF is chosen", async () => {
		// Arrange

		await renderOpenedModal();
		const file = pdfFile("article.pdf");
		pasteFiles(screen.getByPlaceholderText("Paste a link or content"), [
			file,
		]);

		// Act

		fireEvent.click(screen.getByText("Keep as PDF"));
		fireEvent.click(screen.getByRole("button", { name: "Import" }));

		// Assert

		await waitFor(() => {
			expect(runFileImport).toHaveBeenCalledWith(
				file,
				expect.anything(),
				false,
				expect.any(Function),
			);
		});
	});

	it("Should stage a link as a web page when a link is pasted", async () => {
		// Arrange

		await renderOpenedModal();
		const input = screen.getByPlaceholderText("Paste a link or content");

		// Act

		pasteText(input, "https://jqlang.org/manual");

		// Assert

		expect(screen.getByText("jqlang.org/manual")).toBeInTheDocument();
		expect(screen.getByText("Web page")).toBeInTheDocument();
		expect(runUrlImport).not.toHaveBeenCalled();
	});

	it("Should import every staged item with the picked tags when Import is clicked", async () => {
		// Arrange

		await renderOpenedModal();
		const input = screen.getByPlaceholderText("Paste a link or content");
		const file = pdfFile("article.pdf");
		pasteFiles(input, [file]);
		pasteText(
			screen.getByPlaceholderText("Paste another link or content"),
			"https://jqlang.org/manual",
		);
		await userEvent.type(
			screen.getByPlaceholderText("Add tag"),
			"jq{Enter}",
		);
		expect(screen.getByText("Applied to all 2 items")).toBeInTheDocument();

		// Act

		fireEvent.click(screen.getByRole("button", { name: "Import 2 items" }));

		// Assert

		await waitFor(() => {
			expect(runUrlImport).toHaveBeenCalledWith(
				"https://jqlang.org/manual",
				expect.objectContaining({ tags: ["jq"] }),
			);
		});
		expect(runFileImport).toHaveBeenCalledWith(
			file,
			expect.objectContaining({ tags: ["jq"] }),
			true,
			expect.any(Function),
		);
	});

	it("Should import with the parent's tags less the removed ones when a parent tag is removed", async () => {
		// Arrange

		vi.mocked(getElementMeta).mockResolvedValue(FOLDER_META);
		await renderOpenedModal({
			type: "folder",
			data: { meta: FOLDER_META },
		});
		pasteText(
			screen.getByPlaceholderText("Paste a link or content"),
			"https://jqlang.org/manual",
		);
		await screen.findByText("greece");
		// Backspace in the empty input removes the last tag.
		await userEvent.type(
			screen.getByRole("combobox", { name: "Tags" }),
			"{Backspace}jq{Enter}",
		);

		// Act

		fireEvent.click(screen.getByRole("button", { name: "Import" }));

		// Assert

		await waitFor(() => {
			expect(runUrlImport).toHaveBeenCalledWith(
				"https://jqlang.org/manual",
				expect.objectContaining({ tags: ["rome", "jq"] }),
			);
		});
	});

	it("Should keep only the failed and remaining items when an item fails", async () => {
		// Arrange

		vi.mocked(runFileImport)
			.mockResolvedValueOnce(created("first-id"))
			.mockResolvedValueOnce(NO_TEXT_LAYER);
		await renderOpenedModal();
		pasteFiles(screen.getByPlaceholderText("Paste a link or content"), [
			pdfFile("first.pdf"),
			pdfFile("second.pdf"),
			pdfFile("third.pdf"),
		]);

		// Act

		fireEvent.click(screen.getByRole("button", { name: "Import 3 items" }));

		// Assert

		expect(
			await screen.findByText("This PDF has no selectable text."),
		).toBeInTheDocument();
		expect(screen.queryByText("first.pdf")).not.toBeInTheDocument();
		expect(screen.getByText("second.pdf")).toBeInTheDocument();
		expect(screen.getByText("third.pdf")).toBeInTheDocument();
	});

	it("Should give each item the next priority position when several are imported", async () => {
		// Arrange

		vi.mocked(runFileImport)
			.mockResolvedValueOnce(created("first-id"))
			.mockResolvedValueOnce(created("second-id"));
		await renderOpenedModal();
		pasteFiles(screen.getByPlaceholderText("Paste a link or content"), [
			pdfFile("first.pdf"),
			pdfFile("second.pdf"),
		]);

		// Act

		fireEvent.click(screen.getByRole("button", { name: "Import 2 items" }));

		// Assert

		await waitFor(() => {
			expect(runFileImport).toHaveBeenCalledTimes(2);
		});
		const positions = vi
			.mocked(runFileImport)
			.mock.calls.map(([, ctx]) => ctx.priorityPosition);
		expect(positions).toEqual([5, 6]);
	});

	it("Should open only the last created element when several are imported", async () => {
		// Arrange

		vi.mocked(runFileImport)
			.mockResolvedValueOnce(created("first-id"))
			.mockResolvedValueOnce(created("second-id"));
		await renderOpenedModal();
		pasteFiles(screen.getByPlaceholderText("Paste a link or content"), [
			pdfFile("first.pdf"),
			pdfFile("second.pdf"),
		]);

		// Act

		fireEvent.click(screen.getByRole("button", { name: "Import 2 items" }));

		// Assert

		await waitFor(() => {
			expect(openImportedElement).toHaveBeenCalledExactlyOnceWith(
				expect.any(Function),
				expect.any(Function),
				{ type: "learningAsset", id: "second-id" },
			);
		});
	});

	it("Should place a retry after the items already imported when an item fails", async () => {
		// Arrange

		vi.mocked(runFileImport)
			.mockResolvedValueOnce(created("first-id"))
			.mockResolvedValueOnce(NO_TEXT_LAYER);
		await renderOpenedModal();
		pasteFiles(screen.getByPlaceholderText("Paste a link or content"), [
			pdfFile("first.pdf"),
			pdfFile("second.pdf"),
		]);
		fireEvent.click(screen.getByRole("button", { name: "Import 2 items" }));
		await screen.findByText("This PDF has no selectable text.");
		vi.mocked(runFileImport).mockClear();

		// Act

		fireEvent.click(screen.getByRole("button", { name: "Import" }));

		// Assert

		await waitFor(() => {
			expect(runFileImport).toHaveBeenCalledOnce();
		});
		expect(vi.mocked(runFileImport).mock.calls[0][1].priorityPosition).toBe(
			6,
		);
	});

	it("Should keep importing and show its progress in a notification when the modal is closed during an import", async () => {
		// Arrange & Act

		const { store } = await closeDuringImport();

		// Assert

		expect(isModalOpened(store)).toBe(false);
		await waitFor(() => {
			expect(shownNotifications()).toContainEqual(
				expect.objectContaining({
					id: "import-progress",
					loading: true,
				}),
			);
		});
	});

	it("Should report the import in a notification without opening its element when it finishes with the modal closed", async () => {
		// Arrange

		const { finish } = await closeDuringImport();

		// Act

		await act(async () => finish(created("article-id")));

		// Assert

		await waitFor(() => {
			expect(shownNotifications()).toHaveLength(1);
		});
		expect(shownNotifications()[0].id).not.toBe("import-progress");
		expect(openImportedElement).not.toHaveBeenCalled();
		renderNotificationMessage(0);
		expect(screen.getByText("Imported 1 item.")).toBeInTheDocument();
	});

	it("Should open the imported element when Open is clicked in the finished import's notification", async () => {
		// Arrange

		const { finish } = await closeDuringImport();
		await act(async () => finish(created("article-id")));
		await waitFor(() => {
			expect(shownNotifications()).toHaveLength(1);
		});
		renderNotificationMessage(0);

		// Act

		fireEvent.click(screen.getByRole("button", { name: "Open" }));

		// Assert

		expect(openImportedElement).toHaveBeenCalledExactlyOnceWith(
			expect.any(Function),
			expect.any(Function),
			{ type: "learningAsset", id: "article-id" },
		);
	});

	it("Should report the failure in a notification and keep the failed item when an import fails with the modal closed", async () => {
		// Arrange

		const { store, finish } = await closeDuringImport();

		// Act

		await act(async () => finish(NO_TEXT_LAYER));

		// Assert

		await waitFor(() => {
			expect(shownNotifications()).toContainEqual(
				expect.objectContaining({ color: "red" }),
			);
		});
		act(() => {
			store.dispatch(openImportModal());
		});
		expect(
			await screen.findByText("This PDF has no selectable text."),
		).toBeInTheDocument();
		expect(screen.getByText("article.pdf")).toBeInTheDocument();
	});

	it("Should show the import's progress again when Show is clicked in its notification", async () => {
		// Arrange

		const { store } = await closeDuringImport();
		await waitFor(() => {
			expect(shownNotifications()[0]?.message).toBeTruthy();
		});
		renderNotificationMessage(0);

		// Act

		fireEvent.click(screen.getByRole("button", { name: "Show" }));

		// Assert

		expect(isModalOpened(store)).toBe(true);
		expect(
			within(await screen.findByRole("dialog")).getByText("Importing…"),
		).toBeInTheDocument();
		await waitFor(() => {
			expect(shownNotifications()).toHaveLength(0);
		});
	});

	it("Should clear the staged items when the modal is closed with nothing importing", async () => {
		// Arrange

		const { store } = await renderOpenedModal();
		pasteFiles(screen.getByPlaceholderText("Paste a link or content"), [
			pdfFile("article.pdf"),
		]);

		// Act

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		act(() => {
			store.dispatch(openImportModal());
		});

		// Assert

		expect(isModalOpened(store)).toBe(true);
		expect(screen.queryByText("article.pdf")).not.toBeInTheDocument();
		expect(runFileImport).not.toHaveBeenCalled();
	});
});
