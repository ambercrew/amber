import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImportModal from "../../../../features/Import/components/ImportModal";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { runFileImport } from "../../../../features/Import/flows/file";
import { runUrlImport } from "../../../../features/Import/flows/url";
import { getPriorityPositionForNewElement } from "../../../../api/elements/api/elementsApi";
import { openImportedElement } from "../../../../features/Import/openImportedElement";

vi.mock(import("../../../../features/Import/flows/file"));
vi.mock(import("../../../../features/Import/flows/url"));
vi.mock(import("../../../../api/elements/api/elementsApi.ts"));
vi.mock(import("../../../../features/Import/openImportedElement"));

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

async function renderOpenedModal() {
	const result = renderWithProviders(<ImportModal />, {
		preloadedState: {
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

describe("ImportModal", () => {
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
});
