import { useState } from "react";
import {
	Group,
	PasswordInput,
	SegmentedControl,
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

function AiTab() {
	const settings = useAppSelector(selectSettings);
	const dispatch = useAppDispatch();

	const [apiKey, setApiKey] = useState("");

	if (!settings) return null;

	const providerSettings: AiProviderSettings =
		settings.aiProvider === "openAI" ? settings.openai : settings.ollama;

	function handleEnableAiChange(checked: boolean) {
		void dispatch(
			saveSettings(buildUpdateSettingsRequest({ enableAi: checked })),
		);
	}

	function handleProviderChange(value: string) {
		void dispatch(
			saveSettings(
				buildUpdateSettingsRequest({ aiProvider: value as AiProvider }),
			),
		);
	}

	function handleProviderSettingsChange(change: Partial<AiProviderSettings>) {
		if (!settings) return;
		const key = settings.aiProvider === "openAI" ? "openai" : "ollama";
		void dispatch(
			saveSettings(
				buildUpdateSettingsRequest({
					[key]: { ...providerSettings, ...change },
				}),
			),
		);
	}

	function handleApiKeyBlur() {
		if (!apiKey || !settings) return;
		void dispatch(
			saveSettings(
				buildUpdateSettingsRequest({
					openai: { ...settings.openai, apiKey },
				}),
			),
		);
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
							tooltip="Which service runs the AI models. Ollama runs them locally on this machine, OpenAI runs them in the cloud with your API key."
						/>
						<SegmentedControl
							value={settings.aiProvider}
							onChange={handleProviderChange}
							data={[
								{ label: "Ollama", value: "ollama" },
								{ label: "OpenAI", value: "openAI" },
							]}
						/>
					</Stack>

					<Stack gap="xs">
						<FieldLabel
							label="Model name"
							tooltip="The model used for chat and other AI features. It must be available from the selected provider."
						/>
						<TextInput
							key={`model-${settings.aiProvider}`}
							placeholder={
								settings.aiProvider === "ollama"
									? "e.g. llama3.1"
									: "e.g. gpt-4o-mini"
							}
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
							key={`embeddings-${settings.aiProvider}`}
							placeholder={
								settings.aiProvider === "ollama"
									? "e.g. nomic-embed-text"
									: "e.g. text-embedding-3-small"
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

					{settings.aiProvider === "openAI" && (
						<Stack gap="xs">
							<FieldLabel
								label="API key"
								tooltip="Your OpenAI API key, used to authenticate requests. It is stored securely in your operating system's secret store."
							/>
							<PasswordInput
								placeholder={
									settings.openaiApiKeyIsSet
										? "API key is set"
										: "Enter your OpenAI API key"
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
