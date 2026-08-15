export type Theme = "FollowSystem" | "Light" | "Dark";
export type Font = { type: "systemDefault" } | { type: "named"; value: string };
export type AiProvider = "ollama" | "openAI";

export interface AiProviderSettings {
	modelName: string | null;
	embeddingsModelName: string | null;
	apiKey?: string | null;
}

export default interface SettingsDto {
	baseDatabaseDirectory: string;

	theme: Theme;
	font: Font;
	fontHeadings: Font;
	fontMonospace: Font;
	zoomPercentage: number;
	autoSync: boolean;
	trashRetentionDays: number;

	enableAi: boolean;
	aiProvider: AiProvider;
	ollama: AiProviderSettings;
	openai: AiProviderSettings;
	openaiApiKeyIsSet: boolean;
}
