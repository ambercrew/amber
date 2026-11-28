import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { spotlight } from "@mantine/spotlight";
import QuickSettings, {
	QuickSettingsPanel,
} from "../../../../features/App/components/QuickSettings";
import {
	useHasTouchScreen,
	useIsCoarsePointer,
} from "../../../../hooks/useIsCoarsePointer";
import { useIsSmallScreen } from "../../../../hooks/useIsSmallScreen";
import {
	mainScrollPinnedChanged,
	markSlotsChanged,
	readPointSourceChanged,
	setVirtualKeyboardSuppressed,
} from "../../../../stores/app/appReducer";
import { selectIsVirtualKeyboardSuppressed } from "../../../../stores/app/appSelectors";
import { saveSettings } from "../../../../stores/settings/settingsActions";
import { runReadingCommand } from "../../../../commands/readingCommands";
import { isCoarsePointer } from "../../../../utils/pointer";
import { isMobile } from "../../../../utils/tauriUtils";
import { ReadPointSource } from "../../../../types/elements/readPointSource";
import { MarkSlot } from "../../../../types/elements/learningAssetMark";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { setupStore } from "../../../../stores/store";
import { AnyElementDto } from "../../../../api/elements/dto/anyElementDto";

vi.mock(import("../../../../hooks/useIsCoarsePointer"));
vi.mock(import("../../../../hooks/useIsSmallScreen"));
vi.mock(import("../../../../utils/pointer"), async importOriginal => ({
	...(await importOriginal()),
	isCoarsePointer: vi.fn(),
}));
vi.mock(import("../../../../utils/tauriUtils"), async importOriginal => ({
	...(await importOriginal()),
	isMobile: vi.fn(),
}));
vi.mock(import("@mantine/spotlight"), async importOriginal => ({
	...(await importOriginal()),
	spotlight: { open: vi.fn() } as never,
}));
vi.mock(import("../../../../stores/settings/settingsActions"), () => ({
	saveSettings: vi.fn(() => ({ type: "test/saveSettings" })) as never,
}));

// The card's contents are tested on their own, without opening the popover each time.
function renderPanel({
	coarsePointer = false,
	mobile = false,
	smallScreen = false,
	source = null,
	markSlots = null,
	keyboardSuppressed = true,
	touchScreen = true,
}: {
	coarsePointer?: boolean;
	mobile?: boolean;
	smallScreen?: boolean;
	source?: ReadPointSource | null;
	markSlots?: MarkSlot[] | null;
	keyboardSuppressed?: boolean;
	touchScreen?: boolean;
} = {}) {
	vi.mocked(useIsCoarsePointer).mockReturnValue(coarsePointer);
	vi.mocked(isCoarsePointer).mockReturnValue(coarsePointer);
	vi.mocked(useHasTouchScreen).mockReturnValue(touchScreen);
	vi.mocked(isMobile).mockReturnValue(mobile);
	vi.mocked(useIsSmallScreen).mockReturnValue(smallScreen);
	// Spied before rendering: components keep the `dispatch` they rendered with.
	// A published source means a learning asset is open, which its commands check for.
	const store = setupStore(
		source
			? {
					elements: {
						tree: [],
						isLoading: false,
						error: null,
						currentElement: {
							type: "learningAsset",
						} as unknown as AnyElementDto,
						zoomOwnedByCurrentView: false,
					},
				}
			: {},
	);
	const dispatch = vi.spyOn(store, "dispatch");
	const onClose = vi.fn();
	const rendered = renderWithProviders(
		<QuickSettingsPanel onClose={onClose} />,
		{ store },
	);
	act(() => {
		rendered.store.dispatch(
			setVirtualKeyboardSuppressed(keyboardSuppressed),
		);
		if (source)
			rendered.store.dispatch(
				readPointSourceChanged({ learningAssetId: "la-1", source }),
			);
		if (markSlots)
			rendered.store.dispatch(
				markSlotsChanged({ learningAssetId: "la-1", slots: markSlots }),
			);
	});
	return { ...rendered, dispatch, onClose };
}

describe("QuickSettingsPanel", () => {
	it("Should disable the read point actions when no learning asset is open", () => {
		// Arrange & Act

		renderPanel();

		// Assert

		for (const name of [
			"Set the read point here",
			"Go to the read point",
			"Clear the read point",
		])
			expect(screen.getByRole("button", { name })).toBeDisabled();
		expect(screen.queryByText(/Open a learning asset/)).toBeNull();
	});

	it("Should explain the disabled read point in a tooltip when it's hovered", async () => {
		// Arrange

		const user = userEvent.setup();
		renderPanel();

		// Act

		await user.hover(screen.getByText("Read point"));

		// Assert

		expect(
			await screen.findByText(
				"Open a learning asset to use its read point.",
			),
		).toBeInTheDocument();
	});

	it("Should show the read point's source when a learning asset is open", () => {
		// Arrange & Act

		renderPanel({ source: "lookup" });

		// Assert

		expect(screen.getByText("Kept")).toBeInTheDocument();
		expect(
			screen.queryByText(
				"Opened at a spot, so it moves only when you set it.",
			),
		).toBeNull();
	});

	it("Should explain the source in a tooltip when the read point is hovered", async () => {
		// Arrange

		const user = userEvent.setup();
		renderPanel({ source: "lookup" });

		// Act

		await user.hover(screen.getByText("Read point"));

		// Assert

		expect(
			await screen.findByText(
				"Opened at a spot, so it moves only when you set it.",
			),
		).toBeInTheDocument();
	});

	it.each([
		["Set the read point here", "set-read-point"],
		["Go to the read point", "go-to-read-point"],
		["Clear the read point", "clear-read-point"],
	] as const)(
		"Should send its reading command when %s is clicked",
		async (name, type) => {
			// Arrange

			const user = userEvent.setup();
			const { dispatch } = renderPanel({ source: "automatic" });

			// Act

			await user.click(screen.getByRole("button", { name }));

			// Assert

			expect(dispatch).toHaveBeenCalledWith(runReadingCommand({ type }));
		},
	);

	it("Should zoom the app in when zoom in is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		renderPanel();

		// Act

		await user.click(screen.getByRole("button", { name: "Zoom in" }));

		// Assert

		expect(saveSettings).toHaveBeenCalledWith(
			expect.objectContaining({ zoomPercentage: 110 }),
		);
	});

	it("Should hide zoom when on a mobile device", () => {
		// Arrange & Act

		renderPanel({ mobile: true });

		// Assert

		expect(screen.queryByText("Zoom")).toBeNull();
	});

	it("Should hide the line width when the screen is small", () => {
		// Arrange & Act

		renderPanel({ smallScreen: true });

		// Assert

		expect(screen.queryByText("Line width")).toBeNull();
	});

	it("Should save the chosen line width when one is picked", async () => {
		// Arrange

		const user = userEvent.setup();
		renderPanel();

		// Act

		await user.click(screen.getByRole("radio", { name: "Wide" }));

		// Assert

		expect(saveSettings).toHaveBeenCalledWith(
			expect.objectContaining({ lineWidth: "Wide" }),
		);
	});

	it("Should disable going to a mark when no learning asset is open", () => {
		// Arrange & Act

		renderPanel();

		// Assert

		expect(
			screen.getByRole("button", { name: "Go to a mark" }),
		).toBeDisabled();
	});

	it("Should disable going to a mark when none is set", () => {
		// Arrange & Act

		renderPanel({ source: "automatic", markSlots: [] });

		// Assert

		expect(
			screen.getByRole("button", { name: "No marks set yet" }),
		).toBeDisabled();
	});

	it("Should offer only the set marks when the go-to menu is opened", async () => {
		// Arrange

		const user = userEvent.setup();
		renderPanel({ source: "automatic", markSlots: [2] });

		// Act

		await user.click(screen.getByRole("button", { name: "Go to a mark" }));

		// Assert

		expect(
			await screen.findByRole("menuitem", { name: /Go to mark 1/ }),
		).toBeDisabled();
		expect(
			screen.getByRole("menuitem", { name: /Go to mark 2/ }),
		).toBeEnabled();
		expect(
			screen.getByRole("menuitem", { name: /Go to mark 3/ }),
		).toBeDisabled();
	});

	it("Should send the go-to-mark reading command when a set mark is picked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { dispatch } = renderPanel({
			source: "automatic",
			markSlots: [2],
		});
		await user.click(screen.getByRole("button", { name: "Go to a mark" }));

		// Act

		await user.click(
			await screen.findByRole("menuitem", { name: /Go to mark 2/ }),
		);

		// Assert

		expect(dispatch).toHaveBeenCalledWith(
			runReadingCommand({ type: "go-to-mark", slot: 2 }),
		);
	});

	it("Should disable setting a mark when no learning asset is open", () => {
		// Arrange & Act

		renderPanel();

		// Assert

		expect(
			screen.getByRole("button", { name: "Set a mark here" }),
		).toBeDisabled();
	});

	it("Should send the set-mark reading command when a mark is picked from the set menu", async () => {
		// Arrange

		const user = userEvent.setup();
		const { dispatch } = renderPanel({
			source: "automatic",
			markSlots: [],
		});
		await user.click(
			screen.getByRole("button", { name: "Set a mark here" }),
		);

		// Act

		await user.click(
			await screen.findByRole("menuitem", { name: /Set mark 3 here/ }),
		);

		// Assert

		expect(dispatch).toHaveBeenCalledWith(
			runReadingCommand({ type: "set-mark", slot: 3 }),
		);
	});

	it("Should hide the keyboard when the device has no touch screen", () => {
		// Arrange & Act

		renderPanel({ touchScreen: false });

		// Assert

		expect(screen.queryByText("On-screen keyboard")).toBeNull();
	});

	it("Should disable the keyboard switch when the pointer is fine and the keyboard is on", () => {
		// Arrange & Act

		renderPanel({ keyboardSuppressed: false });

		// Assert

		expect(
			screen.getByRole("switch", { name: "On-screen keyboard" }),
		).toBeDisabled();
	});

	it("Should explain the disabled keyboard in a tooltip when it's hovered", async () => {
		// Arrange

		const user = userEvent.setup();
		renderPanel({ keyboardSuppressed: false });

		// Act

		await user.hover(screen.getByText("On-screen keyboard"));

		// Assert

		expect(
			await screen.findByText("Only used with a touch screen."),
		).toBeInTheDocument();
	});

	it("Should turn the keyboard on when its switch is toggled while it's off", async () => {
		// Arrange

		const user = userEvent.setup();
		const { store } = renderPanel({ coarsePointer: true });

		// Act

		await user.click(
			screen.getByRole("switch", { name: "On-screen keyboard" }),
		);

		// Assert

		expect(selectIsVirtualKeyboardSuppressed(store.getState())).toBe(false);
	});

	it("Should turn the keyboard back on when its switch is toggled while the pointer is fine", async () => {
		// Arrange

		const user = userEvent.setup();
		const { store } = renderPanel();

		// Act

		await user.click(
			screen.getByRole("switch", { name: "On-screen keyboard" }),
		);

		// Assert

		expect(selectIsVirtualKeyboardSuppressed(store.getState())).toBe(false);
	});

	it("Should turn the keyboard off when its switch is toggled while it's on", async () => {
		// Arrange

		const user = userEvent.setup();
		const { store } = renderPanel({
			coarsePointer: true,
			keyboardSuppressed: false,
		});

		// Act

		await user.click(
			screen.getByRole("switch", { name: "On-screen keyboard" }),
		);

		// Assert

		expect(selectIsVirtualKeyboardSuppressed(store.getState())).toBe(true);
	});

	it("Should close the card and open the command palette when Commands is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onClose } = renderPanel();

		// Act

		await user.click(screen.getByRole("button", { name: "Commands" }));

		// Assert

		expect(onClose).toHaveBeenCalledOnce();
		expect(spotlight.open).toHaveBeenCalledOnce();
	});

	it("Should close the card and open Settings when Settings is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { store, onClose } = renderPanel();

		// Act

		await user.click(screen.getByRole("button", { name: "Settings" }));

		// Assert

		expect(onClose).toHaveBeenCalledOnce();
		expect(store.getState().app.settingsModalOpened).toBe(true);
	});
});

describe("QuickSettings", () => {
	function renderButton() {
		vi.mocked(useIsCoarsePointer).mockReturnValue(false);
		vi.mocked(isMobile).mockReturnValue(false);
		const { store } = renderWithProviders(<QuickSettings />);
		return {
			button: screen.getByRole("button", { name: "Quick settings" }),
			store,
		};
	}

	it("Should close the card when the header scrolls away", async () => {
		// Arrange

		const user = userEvent.setup();
		const { button, store } = renderButton();
		await user.click(button);

		// Act

		act(() => {
			store.dispatch(mainScrollPinnedChanged(false));
		});

		// Assert

		expect(screen.queryByText("Read point")).not.toBeInTheDocument();
	});

	it("Should open the card when the button is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { button } = renderButton();

		// Act

		await user.click(button);

		// Assert

		expect(screen.getByText("Read point")).toBeInTheDocument();
	});

	it("Should close the card when the button is clicked again", async () => {
		// Arrange

		const user = userEvent.setup();
		const { button } = renderButton();
		await user.click(button);

		// Act

		await user.click(button);

		// Assert

		expect(screen.queryByText("Read point")).toBeNull();
	});

	it("Should not open the card when the button is only hovered", async () => {
		// Arrange

		const user = userEvent.setup();
		const { button } = renderButton();

		// Act

		await user.hover(button);

		// Assert

		expect(screen.queryByText("Read point")).toBeNull();
	});
});
