import { AppShell } from "@mantine/core";
import { fireEvent, screen } from "@testing-library/react";
import Sidebar from "../../../../features/Sidebar/components/Sidebar";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

vi.mock(
	import("../../../../features/Sidebar/components/NavigatorPanel"),
	() => ({ default: () => <div>NavigatorPanel</div> }),
);
vi.mock(
	import("../../../../features/Sidebar/components/PriorityQueuePanel"),
	() => ({ default: () => <div>PriorityQueuePanel</div> }),
);
vi.mock(import("../../../../features/Sidebar/components/TrashPanel"), () => ({
	default: () => <div>TrashPanel</div>,
}));

describe("Sidebar", () => {
	function render() {
		return renderWithProviders(
			<AppShell>
				<Sidebar onCollapse={() => undefined} />
			</AppShell>,
		);
	}

	it("Should show NavigatorPanel when navigator tab is active", () => {
		// Arrange

		render();

		// Act

		fireEvent.click(screen.getByRole("tab", { name: /navigator/i }));

		// Assert

		expect(screen.getByText("NavigatorPanel")).toBeVisible();
		expect(screen.queryByText("PriorityQueuePanel")).not.toBeVisible();
	});

	it("Should show PriorityQueuePanel when priority queue tab is active", () => {
		// Arrange

		render();

		// Act

		fireEvent.click(screen.getByRole("tab", { name: /priority queue/i }));

		// Assert

		expect(screen.getByText("PriorityQueuePanel")).toBeVisible();
		expect(screen.queryByText("NavigatorPanel")).not.toBeVisible();
	});

	it("Should show TrashPanel when trash tab is active", () => {
		// Arrange

		render();

		// Act

		fireEvent.click(screen.getByRole("tab", { name: /trash/i }));

		// Assert

		expect(screen.getByText("TrashPanel")).toBeVisible();
		expect(screen.queryByText("NavigatorPanel")).not.toBeVisible();
	});

	it("Should show NavigatorPanel by default", () => {
		// Arrange

		// Act

		render();

		// Assert

		expect(screen.getByText("NavigatorPanel")).toBeVisible();
		expect(screen.queryByText("PriorityQueuePanel")).not.toBeVisible();
	});
});
