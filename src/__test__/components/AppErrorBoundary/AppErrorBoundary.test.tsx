import { screen } from "@testing-library/react";
import { error as logError } from "@tauri-apps/plugin-log";
import AppErrorBoundary from "../../../components/AppErrorBoundary/AppErrorBoundary";
import { renderWithProviders } from "../../test-utils/renderWithProviders";

vi.mock("@tauri-apps/plugin-log", () => ({
	error: vi.fn().mockResolvedValue(undefined),
}));

function Thrower(): never {
	throw new Error("Boom");
}

describe("AppErrorBoundary", () => {
	beforeEach(() => {
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("Should show the error, a home button and a reload button when a child throws", () => {
		// Arrange

		const ui = (
			<AppErrorBoundary>
				<Thrower />
			</AppErrorBoundary>
		);

		// Act

		renderWithProviders(ui);

		// Assert

		expect(screen.getByText("Something went wrong")).toBeInTheDocument();
		expect(screen.getByText("Boom")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Go home" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Reload" }),
		).toBeInTheDocument();
	});

	it("Should log the error's stack when a child throws", () => {
		// Arrange

		const ui = (
			<AppErrorBoundary>
				<Thrower />
			</AppErrorBoundary>
		);

		// Act

		renderWithProviders(ui);

		// Assert

		expect(logError).toHaveBeenCalledWith(
			expect.stringContaining("Error: Boom"),
		);
	});

	it("Should render its children when nothing throws", () => {
		// Arrange

		const ui = (
			<AppErrorBoundary>
				<span>Content</span>
			</AppErrorBoundary>
		);

		// Act

		renderWithProviders(ui);

		// Assert

		expect(screen.getByText("Content")).toBeInTheDocument();
	});
});
