export type Theme = "FollowSystem" | "Light" | "Dark";
export type AiProvider = "ollama" | "openAI";

export interface AiProviderSettings {
	modelName: string | null;
	embeddingsModelName: string | null;
	apiKey?: string | null;
}

export default interface SettingsDto {
	baseDatabaseDirectory: string;

	theme: Theme;
	zoomPercentage: number;
	autoSync: boolean;
	trashRetentionDays: number;

	enableAi: boolean;
	aiProvider: AiProvider;
	ollama: AiProviderSettings;
	openai: AiProviderSettings;
	openaiApiKeyIsSet: boolean;
}
