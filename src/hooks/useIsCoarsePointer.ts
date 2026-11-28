import { useMediaQuery } from "@mantine/hooks";
import {
	ANY_COARSE_POINTER_QUERY,
	COARSE_POINTER_QUERY,
} from "../utils/pointer";

/** Whether the primary pointer is touch (coarse) rather than a mouse/trackpad (fine). */
export function useIsCoarsePointer(): boolean {
	// Read on the first render: in an effect, every tooltip using this would render twice on mount.
	return useMediaQuery(COARSE_POINTER_QUERY, undefined, {
		getInitialValueInEffect: false,
	});
}

/** Whether the device has a touch screen at all, e.g. a tablet in a keyboard case whose primary pointer is fine. */
export function useHasTouchScreen(): boolean {
	return useMediaQuery(ANY_COARSE_POINTER_QUERY, undefined, {
		getInitialValueInEffect: false,
	});
}
