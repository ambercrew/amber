import { MantineColor } from "@mantine/core";
import { FLASH_DURATION_MS } from "../../../config/motion";

/** Briefly tints `element`'s background in `color`, to show where a jump landed. */
export function flashElement(element: Element, color: MantineColor) {
	const tint = `var(--mantine-color-${color}-light)`;
	// Fades the tint in, holds it at full strength, then fades it out.
	element.animate?.(
		[
			{ backgroundColor: "transparent", easing: "ease-out" },
			{ backgroundColor: tint, offset: 0.15 },
			{ backgroundColor: tint, offset: 0.4, easing: "ease-in" },
			{ backgroundColor: "transparent" },
		],
		{ duration: FLASH_DURATION_MS },
	);
}
