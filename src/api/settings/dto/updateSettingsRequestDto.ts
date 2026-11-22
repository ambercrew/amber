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
	spellCheck: boolean | null;
	trashRetentionDays: number | null;

	enableAi: boolean | null;
	aiProvider: AiProvider | null;
	aiProviders: Partial<Record<AiProvider, AiProviderSettings>> | null;
}

/**
 * An {@link UpdateSettingsRequestDto} leaving every field unchanged (`null`) but those given,
 * so callers name only the settings they change.
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
		spellCheck: null,
		trashRetentionDays: null,
		enableAi: null,
		aiProvider: null,
		aiProviders: null,
		...overrides,
	};
}
