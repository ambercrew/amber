import { Font } from "../../../api/settings/dto/settingsDto";

/** Sentinel Mantine `Select` value standing in for the `systemDefault` font. */
export const SYSTEM_DEFAULT_FONT_VALUE = "__system_default__";

export function fontToSelectValue(font: Font): string {
	return font.type === "named" ? font.value : SYSTEM_DEFAULT_FONT_VALUE;
}

export function selectValueToFont(value: string): Font {
	return value === SYSTEM_DEFAULT_FONT_VALUE
		? { type: "systemDefault" }
		: { type: "named", value };
}
