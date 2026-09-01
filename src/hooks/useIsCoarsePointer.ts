import { useMediaQuery } from "@mantine/hooks";
import { COARSE_POINTER_QUERY } from "../utils/pointer";

/** Whether the primary pointer is touch (coarse) rather than a mouse/trackpad (fine). */
export function useIsCoarsePointer(): boolean {
	return useMediaQuery(COARSE_POINTER_QUERY) ?? false;
}
