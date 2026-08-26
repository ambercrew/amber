import { useNavigate } from "react-router";
import { Button, Group, NumberInput, Stack, Switch, Text } from "@mantine/core";
import { FolderOpenIcon } from "@phosphor-icons/react";
import { open } from "@tauri-apps/plugin-dialog";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { selectSettings } from "../../../stores/settings/settingsSelector";
import AutosizeTextInput from "../../../components/AutosizeTextInput/AutosizeTextInput";
import { changeDatabaseDirectory } from "../../../stores/app/appActions";
import { saveSettings } from "../../../stores/settings/settingsActions";
import { buildUpdateSettingsRequest } from "../../../api/settings/dto/updateSettingsRequestDto";
import { isMobile } from "../../../utils/tauriUtils";

const RETENTION_MIN_DAYS = 1;
const RETENTION_MAX_DAYS = 99;

function DataTab() {
	const settings = useAppSelector(selectSettings);
	const dispatch = useAppDispatch();
	const navigate = useNavigate();

	if (!settings) return null;

	function handleRetentionChange(value: string | number) {
		const days = typeof value === "number" ? value : Number(value);
		if (!Number.isFinite(days) || days < RETENTION_MIN_DAYS) return;
		void dispatch(
			saveSettings(
				buildUpdateSettingsRequest({ trashRetentionDays: days }),
			),
		);
	}

	function handleAutoSyncChange(autoSync: boolean) {
		void dispatch(saveSettings(buildUpdateSettingsRequest({ autoSync })));
	}

	async function handleChangeDirectory() {
		const selected = await open({
			directory: true,
			multiple: false,
			defaultPath: settings?.baseDatabaseDirectory,
		});

		if (typeof selected !== "string") return;

		await dispatch(changeDatabaseDirectory(selected, navigate));
	}

	return (
		<Stack gap="lg" pt="md">
			<Stack gap="xs">
                {!isMobile() && (
                    <>
                    <Text size="sm">Database directory</Text>
                    <Text size="xs" c="dimmed">
                            Where your data is stored. Changing this reconnects the
                            database.
                        </Text>
                        </>
                    )}
				<Group align="flex-end" gap="sm" wrap="nowrap">
					<AutosizeTextInput
						readOnly
						value={settings.baseDatabaseDirectory}
						style={{ flex: 1 }}
					/>
					<Button
						variant="default"
						leftSection={<FolderOpenIcon />}
						onClick={() => void handleChangeDirectory()}>
						Change…
					</Button>
				</Group>
			</Stack>

			<Stack gap="xs">
				<Text size="sm">Keep trashed elements for</Text>
				<Text size="xs" c="dimmed">
					Elements in the trash are permanently deleted once they have
					been there this long.
				</Text>
				<NumberInput
					value={settings.trashRetentionDays}
					onChange={handleRetentionChange}
					min={RETENTION_MIN_DAYS}
					max={RETENTION_MAX_DAYS}
					clampBehavior="strict"
					allowDecimal={false}
					suffix=" days"
				/>
			</Stack>

			<Stack gap="xs">
				<Switch
					label="Sync on start and close"
					checked={settings.autoSync}
					onChange={e =>
						handleAutoSyncChange(e.currentTarget.checked)
					}
				/>
				<Text size="xs" c="dimmed">
					Automatically syncs with the cloud when the app starts and
					before it closes.
				</Text>
			</Stack>
		</Stack>
	);
}

export default DataTab;
