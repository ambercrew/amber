import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { useIsSmallScreen } from "./useIsSmallScreen";

/**
 * On small screens the side panels cover the whole viewport, so opening an
 * element has to close them — otherwise it stays hidden behind them.
 */
export function useCloseSidebarOnSmallScreenNavigation(
	closeSidebars: () => void,
) {
	const location = useLocation();
	const isSmallScreen = useIsSmallScreen();
	const closeSidebarsRef = useRef(closeSidebars);

	useEffect(() => {
		closeSidebarsRef.current = closeSidebars;
	});

	useEffect(() => {
		if (!isSmallScreen) return;
		closeSidebarsRef.current();
	}, [location.key, isSmallScreen]);
}
