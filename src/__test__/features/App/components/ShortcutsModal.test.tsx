import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShortcutsModal from "../../../../features/App/components/ShortcutsModal";
import { openShortcutsModal } from "../../../../stores/app/appReducer";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

function renderOpenModal() {
	const result = renderWithProviders(<ShortcutsModal />);
	act(() => {
		result.store.dispatch(openShortcutsModal());
	});
	return result;
}

describe("ShortcutsModal", () => {
	it("Should show the mark keys as one range when the modal opens", () => {
		// Arrange & Act

		renderOpenModal();

		// Assert

		expect(screen.getAllByText("Ctrl + 1–3")).toHaveLength(1);
		expect(screen.getByText("Alt + 1–3")).toBeInTheDocument();
		expect(screen.getByText("1–4")).toBeInTheDocument();
		expect(screen.queryByText("Ctrl + 2")).not.toBeInTheDocument();
	});

	it("Should show back and forward as one compact key when the modal opens", () => {
		// Arrange & Act

		renderOpenModal();

		// Assert

		expect(screen.getByText("Alt + ← →")).toBeInTheDocument();
	});

	it("Should show only the plus key for zoom in when the standard group is expanded", async () => {
		// Arrange

		renderOpenModal();

		// Act

		await userEvent.click(screen.getByRole("button", { name: /Standard/ }));

		// Assert

		expect(screen.getByText("Ctrl + +")).toBeInTheDocument();
		expect(screen.queryByText("Ctrl + =")).not.toBeInTheDocument();
	});

	it("Should keep the standard keys collapsed when the modal opens", () => {
		// Arrange & Act

		renderOpenModal();

		// Assert

		expect(
			screen.getByRole("button", { name: /Standard/ }),
		).toHaveAttribute("aria-expanded", "false");
		const headings = screen
			.getAllByRole("heading", { level: 5 })
			.map(heading => heading.textContent);
		expect(headings).toContain("View");
		expect(headings).not.toContain("Zoom");
		expect(headings).not.toContain("Find in page");
	});

	it("Should list only matching rows when a description is searched", async () => {
		// Arrange

		renderOpenModal();

		// Act

		await userEvent.type(
			screen.getByRole("textbox", { name: "Search shortcuts" }),
			"go to mark",
		);

		// Assert

		expect(screen.getByText("Go to mark")).toBeInTheDocument();
		expect(screen.queryByText("Set mark")).not.toBeInTheDocument();
	});

	it("Should find a key inside a range when its exact shortcut is searched", async () => {
		// Arrange

		renderOpenModal();

		// Act

		await userEvent.type(
			screen.getByRole("textbox", { name: "Search shortcuts" }),
			"ctrl+2",
		);

		// Assert

		expect(screen.getByText("Set mark")).toBeInTheDocument();
	});

	it("Should show standard keys without the toggle when a search matches them", async () => {
		// Arrange

		renderOpenModal();

		// Act

		await userEvent.type(
			screen.getByRole("textbox", { name: "Search shortcuts" }),
			"zoom",
		);

		// Assert

		const zoomIn = screen.getByText(
			(_, element) =>
				element?.tagName === "P" && element.textContent === "Zoom in",
		);
		expect(zoomIn).toBeVisible();
		expect(
			screen.queryByRole("button", { name: /Standard/ }),
		).not.toBeInTheDocument();
	});

	it("Should show an empty message when nothing matches the search", async () => {
		// Arrange

		renderOpenModal();

		// Act

		await userEvent.type(
			screen.getByRole("textbox", { name: "Search shortcuts" }),
			"xyzzy",
		);

		// Assert

		expect(screen.getByText(/No shortcuts match/)).toBeInTheDocument();
	});

	it("Should mark the matched text when a description is searched", async () => {
		// Arrange

		renderOpenModal();

		// Act

		await userEvent.type(
			screen.getByRole("textbox", { name: "Search shortcuts" }),
			"mark",
		);

		// Assert

		const marks = document.querySelectorAll("mark");
		expect(marks.length).toBeGreaterThan(0);
		marks.forEach(mark => expect(mark.textContent).toMatch(/^mark$/i));
	});

	it("Should put the matches in the first column when only right-column sections match", async () => {
		// Arrange

		renderOpenModal();

		// Act

		await userEvent.type(
			screen.getByRole("textbox", { name: "Search shortcuts" }),
			"again",
		);

		// Assert

		const studyHeading = screen.getByRole("heading", { name: "Study" });
		const grid = studyHeading.closest(".mantine-SimpleGrid-root");
		expect(grid?.children).toHaveLength(1);
		expect(grid?.children[0]).toContainElement(studyHeading);
	});
});
