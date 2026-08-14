import { PropsWithChildren } from "react";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { useCloseSidebarOnSmallScreenNavigation } from "../../hooks/useCloseSidebarOnSmallScreenNavigation";
import { useElementParams } from "../../hooks/useElementParams";
import { useIsSmallScreen } from "../../hooks/useIsSmallScreen";

vi.mock(import("../../hooks/useElementParams"));
vi.mock(import("../../hooks/useIsSmallScreen"));

function Wrapper({ children }: PropsWithChildren) {
	return <MemoryRouter>{children}</MemoryRouter>;
}

function render(closeSidebar: () => void) {
	return renderHook(
		() => useCloseSidebarOnSmallScreenNavigation(closeSidebar),
		{ wrapper: Wrapper },
	);
}

describe("useCloseSidebarOnSmallScreenNavigation", () => {
	beforeEach(() => {
		vi.mocked(useIsSmallScreen).mockReturnValue(true);
		vi.mocked(useElementParams).mockReturnValue({
			type: "folder",
			id: "folder-1",
		});
	});

	it("Should close the sidebar when an element is opened on a small screen", () => {
		// Arrange

		const closeSidebar = vi.fn();

		// Act

		render(closeSidebar);

		// Assert

		expect(closeSidebar).toHaveBeenCalledTimes(1);
	});

	it("Should not close the sidebar when the screen is not small", () => {
		// Arrange

		vi.mocked(useIsSmallScreen).mockReturnValue(false);
		const closeSidebar = vi.fn();

		// Act

		render(closeSidebar);

		// Assert

		expect(closeSidebar).not.toHaveBeenCalled();
	});

	it("Should close the sidebar again when another element is opened", () => {
		// Arrange

		const closeSidebar = vi.fn();
		vi.mocked(useElementParams).mockReturnValue(null);
		const { rerender } = render(closeSidebar);

		// Act

		vi.mocked(useElementParams).mockReturnValue({
			type: "learningAsset",
			id: "learningAsset-1",
		});
		rerender();

		// Assert

		expect(closeSidebar).toHaveBeenCalledTimes(1);
	});

	it("Should close the sidebar when the viewport shrinks while an element is open", () => {
		// Arrange

		const closeSidebar = vi.fn();
		vi.mocked(useIsSmallScreen).mockReturnValue(false);
		const { rerender } = render(closeSidebar);

		// Act

		vi.mocked(useIsSmallScreen).mockReturnValue(true);
		rerender();

		// Assert

		expect(closeSidebar).toHaveBeenCalledTimes(1);
	});
});
