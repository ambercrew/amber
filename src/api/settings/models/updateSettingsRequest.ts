// TODO: Move to dto folder
import {
	AiProvider,
	AiProviderSettings,
	Theme,
} from "../dto/updateSettingsRequestDto";

export default interface UpdateSettingsRequest {
	baseDatabaseDirectory: string | null;

	theme: Theme | null;
	zoomPercentage: number | null;
	autoSync: boolean | null;
	trashRetentionDays: number | null;

	enableAi: boolean | null;
	aiProvider: AiProvider | null;
	ollama: AiProviderSettings | null;
	openai: AiProviderSettings | null;
}

/**
 * Builds an {@link UpdateSettingsRequest} that leaves every field unchanged
 * (all `null`), overriding only the fields provided. Use this so callers only
 * specify the settings they actually want to change.
 */
export function buildUpdateSettingsRequest(
	overrides: Partial<UpdateSettingsRequest>,
): UpdateSettingsRequest {
	return {
		baseDatabaseDirectory: null,
		theme: null,
		zoomPercentage: null,
		autoSync: null,
		trashRetentionDays: null,
		enableAi: null,
		aiProvider: null,
		ollama: null,
		openai: null,
		...overrides,
	};
}
