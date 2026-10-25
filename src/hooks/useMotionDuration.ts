import { useMantineTheme } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import { MOTION_DURATION_MS } from "../config/motion";

/** `durationMs` (the app's default animation duration), or 0 when reduced motion applies, as Mantine's own components decide it. */
export function useMotionDuration(durationMs = MOTION_DURATION_MS) {
	const theme = useMantineTheme();
	const prefersReducedMotion = useReducedMotion();
	return theme.respectReducedMotion && prefersReducedMotion ? 0 : durationMs;
}
