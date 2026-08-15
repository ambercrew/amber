import { Font } from "../../../api/settings/dto/settingsDto";

/** CSS `font-family` value for the font, or `null` to fall back to Mantine's default stack. */
export function fontToCssFamily(font: Font): string | null {
	return font.type === "named" ? `"${font.value}"` : null;
}

export function applyFontVariable(cssVariable: string, font: Font) {
	const fontFamily = fontToCssFamily(font);
	if (fontFamily) {
		document.documentElement.style.setProperty(cssVariable, fontFamily);
	} else {
		document.documentElement.style.removeProperty(cssVariable);
	}
}
