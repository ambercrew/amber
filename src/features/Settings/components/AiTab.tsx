import { useState } from "react";
import {
	Group,
	PasswordInput,
	Select,
	Stack,
	Switch,
	TextInput,
} from "@mantine/core";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { selectSettings } from "../../../stores/settings/settingsSelector";
import { saveSettings } from "../../../stores/settings/settingsActions";
import { buildUpdateSettingsRequest } from "../../../api/settings/dto/updateSettingsRequestDto";
import FieldLabel from "../../../components/FieldLabel/FieldLabel";
import FieldInfoIcon from "../../../components/FieldLabel/FieldInfoIcon";
import {
	AiProvider,
	AiProviderSettings,
} from "../../../api/settings/dto/settingsDto";

interface ProviderInfo {
	label: string;
	modelPlaceholder: string;
	embeddingsModelPlaceholder: string;
	requiresApiKey: boolean;
}

const providers: Record<AiProvider, ProviderInfo> = {
	ollama: {
		label: "Ollama",
		modelPlaceholder: "e.g. llama3.1",
		embeddingsModelPlaceholder: "e.g. nomic-embed-text",
		requiresApiKey: false,
	},
	openAI: {
		label: "OpenAI",
		modelPlaceholder: "e.g. gpt-4o-mini",
		embeddingsModelPlaceholder: "e.g. text-embedding-3-small",
		requiresApiKey: true,
	},
	openRouter: {
		label: "OpenRouter",
		modelPlaceholder: "e.g. openai/gpt-4o-mini",
		embeddingsModelPlaceholder: "e.g. openai/text-embedding-3-small",
		requiresApiKey: true,
	},
	gemini: {
		label: "Gemini",
		modelPlaceholder: "e.g. gemini-2.5-flash",
		embeddingsModelPlaceholder: "e.g. gemini-embedding-001",
		requiresApiKey: true,
	},
};

function AiTab() {
	const settings = useAppSelector(selectSettings);
	const dispatch = useAppDispatch();

	const [apiKey, setApiKey] = useState("");

	if (!settings) return null;

	const provider = settings.aiProvider;
	const providerInfo = providers[provider];
	const { apiKeyIsSet, ...providerSettings } = settings.aiProviders[provider];

	function handleEnableAiChange(checked: boolean) {
		void dispatch(
			saveSettings(buildUpdateSettingsRequest({ enableAi: checked })),
		);
	}

	function handleProviderChange(value: string | null) {
		if (!value) return;
		void dispatch(
			saveSettings(
				buildUpdateSettingsRequest({ aiProvider: value as AiProvider }),
			),
		);
	}

	function handleProviderSettingsChange(change: Partial<AiProviderSettings>) {
		void dispatch(
			saveSettings(
				buildUpdateSettingsRequest({
					aiProviders: {
						[provider]: { ...providerSettings, ...change },
					},
				}),
			),
		);
	}

	function handleApiKeyBlur() {
		if (!apiKey) return;
		handleProviderSettingsChange({ apiKey });
		setApiKey("");
	}

	return (
		<Stack gap="lg" pt="md">
			<Group gap={4}>
				<Switch
					label="Enable AI"
					checked={settings.enableAi}
					onChange={e =>
						handleEnableAiChange(e.currentTarget.checked)
					}
				/>
				<FieldInfoIcon tooltip="Turns the AI features on. Disabling AI hides it everywhere in the app, including the chat panel and its commands." />
			</Group>

			{settings.enableAi && (
				<>
					<Stack gap="xs">
						<FieldLabel
							label="Provider"
							tooltip="Which service runs the AI models. Ollama runs them locally on this machine, OpenAI, OpenRouter and Gemini run them in the cloud with your API key."
						/>
						<Select
							value={provider}
							onChange={handleProviderChange}
							data={Object.entries(providers).map(
								([value, { label }]) => ({ label, value }),
							)}
							allowDeselect={false}
							withAlignedLabels
						/>
					</Stack>

					<Stack gap="xs">
						<FieldLabel
							label="Model name"
							tooltip="The model used for chat and other AI features. It must be available from the selected provider."
						/>
						<TextInput
							key={`model-${provider}`}
							placeholder={providerInfo.modelPlaceholder}
							defaultValue={providerSettings.modelName ?? ""}
							onBlur={e =>
								handleProviderSettingsChange({
									modelName: e.currentTarget.value || null,
								})
							}
						/>
					</Stack>

					<Stack gap="xs">
						<FieldLabel
							label="Embeddings model name"
							tooltip="The model used to semantically search documents you upload to a chat. It must be available from the selected provider."
						/>
						<TextInput
							key={`embeddings-${provider}`}
							placeholder={
								providerInfo.embeddingsModelPlaceholder
							}
							defaultValue={
								providerSettings.embeddingsModelName ?? ""
							}
							onBlur={e =>
								handleProviderSettingsChange({
									embeddingsModelName:
										e.currentTarget.value || null,
								})
							}
						/>
					</Stack>

					{providerInfo.requiresApiKey && (
						<Stack gap="xs">
							<FieldLabel
								label="API key"
								tooltip={`Your ${providerInfo.label} API key, used to authenticate requests. It is stored securely in your operating system's secret store.`}
							/>
							<PasswordInput
								key={`api-key-${provider}`}
								placeholder={
									apiKeyIsSet
										? "API key is set"
										: `Enter your ${providerInfo.label} API key`
								}
								value={apiKey}
								onChange={e => setApiKey(e.currentTarget.value)}
								onBlur={handleApiKeyBlur}
							/>
						</Stack>
					)}
				</>
			)}
		</Stack>
	);
}

export default AiTab;
