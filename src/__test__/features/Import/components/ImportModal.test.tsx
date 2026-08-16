import { fireEvent, screen, waitFor } from "@testing-library/react";
import ImportModal from "../../../../features/Import/components/ImportModal";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { runFileImport } from "../../../../features/Import/flows/file";

vi.mock(import("../../../../features/Import/flows/file"));

function pdfFile(name: string) {
	return new File(["%PDF-1.4"], name, { type: "application/pdf" });
}

function pasteFiles(input: HTMLElement, files: File[]) {
	fireEvent.paste(input, {
		clipboardData: {
			files,
			getData: () => "",
		},
	});
}

function renderOpenedModal() {
	return renderWithProviders(<ImportModal />, {
		preloadedState: {
			app: {
				startedInitialStateLoading: false,
				importModalOpened: true,
				studyProfileModalOpened: false,
				settingsModalOpened: false,
				priorityModalOpened: false,
				studySessionSettingsModalOpened: false,
				authModalOpened: false,
				authModalInitialTab: "sign-in",
			},
		},
	});
}

describe("ImportModal", () => {
	it("Should stage the file without starting import when a file is pasted", () => {
		// Arrange

		renderOpenedModal();
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

		renderOpenedModal();
		const input = screen.getByPlaceholderText("Paste a link or content");
		const file = pdfFile("article.pdf");
		pasteFiles(input, [file]);

		// Act

		fireEvent.click(screen.getByRole("button", { name: "Import" }));

		// Assert

		await waitFor(() => {
			expect(runFileImport).toHaveBeenCalledWith(
				[file],
				expect.anything(),
				expect.any(Function),
			);
		});
	});

	it("Should show one row per file when multiple files are pasted", () => {
		// Arrange

		renderOpenedModal();
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

	it("Should remove only the targeted file when its remove button is clicked", () => {
		// Arrange

		renderOpenedModal();
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

	it("Should revert to the link input when the last staged file is removed", () => {
		// Arrange

		renderOpenedModal();
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
});
