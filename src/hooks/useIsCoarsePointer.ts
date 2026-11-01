import { useMediaQuery } from "@mantine/hooks";
import { COARSE_POINTER_QUERY } from "../utils/pointer";

/** Whether the primary pointer is touch (coarse) rather than a mouse/trackpad (fine). */
export function useIsCoarsePointer(): boolean {
	// Read on the first render: in an effect, every tooltip using this would render twice on mount.
	return useMediaQuery(COARSE_POINTER_QUERY, undefined, {
		getInitialValueInEffect: false,
	});
}
