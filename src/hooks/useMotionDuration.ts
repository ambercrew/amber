import { useMantineTheme } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import { MOTION_DURATION_MS } from "../config/motion";

/** The app's animation duration in ms, or 0 when reduced motion applies, as Mantine's own components decide it. */
export function useMotionDuration() {
	const theme = useMantineTheme();
	const prefersReducedMotion = useReducedMotion();
	return theme.respectReducedMotion && prefersReducedMotion
		? 0
		: MOTION_DURATION_MS;
}
