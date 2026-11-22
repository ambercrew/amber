import React, { JSX, PropsWithChildren } from "react";
import { render, RenderOptions } from "@testing-library/react";
import { Provider } from "react-redux";
import { AppStore, RootState, setupStore } from "../../stores/store";
import { MemoryRouter, useLocation, MemoryRouterProps } from "react-router";
import { MantineProvider } from "@mantine/core";

interface ExtendedRenderOptions extends Omit<RenderOptions, "queries"> {
	preloadedState?: Partial<RootState>;
	store?: AppStore;
	memoryRouterProps?: MemoryRouterProps;
}

export const LOCATION_DISPLAY_TEST_ID = "location-display";

/** A helper function for rendering that sets the default store used in the app,
 * additionally it adds a React Router.
 */
export function renderWithProviders(
	ui: React.ReactElement,
	{
		preloadedState = {},
		store = setupStore(preloadedState),
		memoryRouterProps = {},
		...renderOptions
	}: ExtendedRenderOptions = {},
) {
	function LocationDisplay() {
		const location = useLocation();
		return (
			<div data-testid={LOCATION_DISPLAY_TEST_ID}>
				{location.pathname}
				{location.search}
			</div>
		);
	}

	function Wrapper({ children }: PropsWithChildren<object>): JSX.Element {
		return (
			// `env="test"` renders Mantine's `Transition` children synchronously, so a Menu, Popover or Modal is
			// there in the same flush as the click opening it and queries don't race it under parallel runs.
			<MantineProvider env="test">
				<MemoryRouter {...memoryRouterProps}>
					<LocationDisplay />
					<Provider store={store}>{children}</Provider>
				</MemoryRouter>
			</MantineProvider>
		);
	}
	return {
		store,
		...render(ui, { wrapper: Wrapper, ...renderOptions }),
	};
}
