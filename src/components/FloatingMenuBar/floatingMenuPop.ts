import { MANTINE_TRANSITIONS } from "@mantine/core";

/** Mantine's `pop` for a floating menu, rising when it sits above its anchor and dropping when below. */
export function floatingMenuPop(above: boolean) {
	return above
		? MANTINE_TRANSITIONS.pop
		: MANTINE_TRANSITIONS["pop-top-left"];
}
