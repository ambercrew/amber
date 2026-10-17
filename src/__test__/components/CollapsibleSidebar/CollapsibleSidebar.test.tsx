import { AppShell } from "@mantine/core";
import { act, fireEvent, screen } from "@testing-library/react";
import CollapsibleSidebar, {
	SidebarTab,
} from "../../../components/CollapsibleSidebar/CollapsibleSidebar";
import { renderWithProviders } from "../../test-utils/renderWithProviders";

const TABS: SidebarTab[] = [
	{ value: "first", title: "First", icon: "1", panel: "First panel" },
	{ value: "second", title: "Second", icon: "2", panel: "Second panel" },
];

function panelFadeBox(text: string) {
	// The fading box wraps the padded content box.
	const box = screen.getByText(text).closest("[style*='opacity']");
	if (!(box instanceof HTMLElement)) throw new Error("Fade box not found");
	return box;
}

describe("CollapsibleSidebar", () => {
	let frames: FrameRequestCallback[];

	beforeEach(() => {
		localStorage.clear();
		frames = [];
		vi.stubGlobal(
			"requestAnimationFrame",
			(callback: FrameRequestCallback) => {
				frames.push(callback);
				return frames.length;
			},
		);
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	function renderSidebar() {
		return renderWithProviders(
			<AppShell>
				<CollapsibleSidebar
					tabs={TABS}
					defaultValue="first"
					onCollapse={vi.fn()}
					localStorageKey="test-sidebar"
				/>
			</AppShell>,
		);
	}

	async function switchTo(title: string) {
		fireEvent.click(screen.getByRole("tab", { name: title }));
		await act(async () => {});
	}

	it("Should show the initial panel without fading it in when it first renders", () => {
		// Arrange & Act

		renderSidebar();

		// Assert

		expect(panelFadeBox("First panel")).toHaveStyle({ opacity: "1" });
	});

	it("Should start a newly selected panel transparent when its tab is clicked", async () => {
		// Arrange

		renderSidebar();

		// Act

		await switchTo("Second");

		// Assert

		expect(panelFadeBox("Second panel")).toHaveStyle({ opacity: "0" });
	});

	it("Should fade the newly selected panel in on the next frame when its tab is clicked", async () => {
		// Arrange

		renderSidebar();
		await switchTo("Second");

		// Act

		act(() => frames.splice(0).forEach(frame => frame(0)));

		// Assert

		expect(panelFadeBox("Second panel")).toHaveStyle({ opacity: "1" });
	});
});
