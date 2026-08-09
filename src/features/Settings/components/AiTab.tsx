import { useState } from "react";
import {
	PasswordInput,
	SegmentedControl,
	Stack,
	Switch,
	Text,
	TextInput,
} from "@mantine/core";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { selectSettings } from "../../../stores/settings/settingsSelector";
import { saveSettings } from "../../../stores/settings/settingsActions";
import { buildUpdateSettingsRequest } from "../../../api/settings/dto/updateSettingsRequest";
import {
	AiProvider,
	AiProviderSettings,
} from "../../../api/settings/dto/updateSettingsRequestDto";

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
			<Stack gap="xs">
				<Switch
					label="Enable AI"
					checked={settings.enableAi}
					onChange={e =>
						handleEnableAiChange(e.currentTarget.checked)
					}
				/>
				<Text size="xs" c="dimmed">
					Disabling AI hides it everywhere in the app, including the
					chat panel and its commands.
				</Text>
			</Stack>

			{settings.enableAi && (
				<>
					<Stack gap="xs">
						<Text size="sm">Provider</Text>
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
						<Text size="sm">Model name</Text>
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
						<Text size="sm">Embeddings model name</Text>
						<Text size="xs" c="dimmed">
							Used to semantically search documents you upload to
							a chat.
						</Text>
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
							<Text size="sm">API key</Text>
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
