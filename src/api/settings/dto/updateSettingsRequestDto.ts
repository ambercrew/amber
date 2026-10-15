import {
	AiProvider,
	AiProviderSettings,
	Font,
	LineWidth,
	Theme,
} from "./settingsDto";

export default interface UpdateSettingsRequestDto {
	baseDatabaseDirectory: string | null;

	theme: Theme | null;
	font: Font | null;
	fontHeadings: Font | null;
	fontMonospace: Font | null;
	zoomPercentage: number | null;
	lineWidth: LineWidth | null;
	autoSync: boolean | null;
	trashRetentionDays: number | null;

	enableAi: boolean | null;
	aiProvider: AiProvider | null;
	aiProviders: Partial<Record<AiProvider, AiProviderSettings>> | null;
}

/**
 * Builds an {@link UpdateSettingsRequestDto} that leaves every field unchanged
 * (all `null`), overriding only the fields provided. Use this so callers only
 * specify the settings they actually want to change.
 */
export function buildUpdateSettingsRequest(
	overrides: Partial<UpdateSettingsRequestDto>,
): UpdateSettingsRequestDto {
	return {
		baseDatabaseDirectory: null,
		theme: null,
		font: null,
		fontHeadings: null,
		fontMonospace: null,
		zoomPercentage: null,
		lineWidth: null,
		autoSync: null,
		trashRetentionDays: null,
		enableAi: null,
		aiProvider: null,
		aiProviders: null,
		...overrides,
	};
}
