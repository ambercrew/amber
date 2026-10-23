import { MantineColor } from "@mantine/core";
import { FLASH_DURATION_MS } from "../../../config/motion";

/** Briefly tints `element`'s background in `color`, to show where a jump landed. */
export function flashElement(element: Element, color: MantineColor) {
	element.animate?.(
		[
			{ backgroundColor: `var(--mantine-color-${color}-light)` },
			{ backgroundColor: "transparent" },
		],
		{ duration: FLASH_DURATION_MS, easing: "ease-out" },
	);
}
