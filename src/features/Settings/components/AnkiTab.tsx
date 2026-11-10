import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Group, List, Stack, Text } from "@mantine/core";
import { getAnkiSyncStatus } from "../../../api/ankiSync/api/ankiSyncApi";
import { AnkiSyncStatusDto } from "../../../api/ankiSync/dto/ankiSyncStatusDto";
import useApi from "../../../hooks/useApi";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { startAnkiSync } from "../../../stores/ankiSync/ankiSyncActions";
import { selectIsAnkiSyncBusy } from "../../../stores/ankiSync/ankiSyncSelectors";

const ANKI_CONNECT_CODE = "2055492159";

const SYNC_RULES = [
	{
		title: "What syncs",
		items: [
			"New cards, reviews and due dates, both ways. The app that reviewed a card last decides when it’s due, unless you moved its due date afterwards.",
			"You choose which Anki decks to import. Folders made in Amber go under an “Amber” deck; imported decks keep their place in Anki wherever you move them in Amber.",
		],
	},
	{
		title: "Editing",
		items: [
			"Cards made in Amber: edit them in either app, and the later edit wins. Image occlusions made in Amber: edit them in Amber.",
			"Cards and image occlusions imported from Anki: edit them in Anki. Amber takes those edits but doesn’t send its own back.",
		],
	},
	{
		title: "Deleting",
		items: [
			"Deleted in Anki: the card moves to Amber’s trash. Deleted from Amber’s trash: it’s deleted from Anki too, for good.",
			"You’re shown any deletions before they happen.",
		],
	},
];

function AnkiTab() {
	const dispatch = useAppDispatch();
	const isBusy = useAppSelector(selectIsAnkiSyncBusy);
	const { callApi, isSendingRequest, errorMessage, clearErrorMessage } =
		useApi();
	const [status, setStatus] = useState<AnkiSyncStatusDto | null>(null);
	// When the user last tested, shown so a repeated failure still visibly answers the click.
	const [testedAt, setTestedAt] = useState<Date | null>(null);

	const checkConnection = useCallback(() => {
		clearErrorMessage();
		return callApi(async () => setStatus(await getAnkiSyncStatus()));
	}, [callApi, clearErrorMessage]);

	function handleTestConnection() {
		void checkConnection().then(() => setTestedAt(new Date()));
	}

	// Refreshed after a sync too, for its last synced time.
	useEffect(() => {
		if (!isBusy) void checkConnection();
	}, [isBusy, checkConnection]);

	const isConnected = Boolean(status?.profile);

	return (
		<Stack gap="lg" pt="md">
			<Stack gap="xs">
				<Group gap="xs">
					<Badge
						color={isConnected ? "green" : "gray"}
						variant="light">
						{isConnected ? "Connected" : "Not connected"}
					</Badge>
					{status?.profile && (
						<Text size="sm">Profile “{status.profile}”</Text>
					)}
				</Group>
				{isConnected && (
					<Text size="sm" c="dimmed">
						{status?.lastSyncedAt
							? `Last synced ${new Date(status.lastSyncedAt).toLocaleString()}`
							: "Not synced yet"}
					</Text>
				)}
			</Stack>

			{testedAt && (
				<Alert
					color={isConnected && !errorMessage ? "green" : "red"}
					title={
						isConnected && !errorMessage
							? "Connection works"
							: "Couldn’t connect to Anki"
					}>
					<Stack gap={4}>
						{(errorMessage ?? status?.error) && (
							<Text size="sm">
								{errorMessage ?? status?.error}
							</Text>
						)}
						<Text size="xs" c="dimmed">
							Tested at {testedAt.toLocaleTimeString()}
						</Text>
					</Stack>
				</Alert>
			)}

			{status && !isConnected && (
				<Stack gap="xs">
					<Text size="sm" fw={500}>
						To connect Anki
					</Text>
					<List type="ordered" size="sm" spacing={4}>
						<List.Item>
							In Anki, open Tools → Add-ons → Get Add-ons.
						</List.Item>
						<List.Item>
							Enter the code {ANKI_CONNECT_CODE} to install
							AnkiConnect.
						</List.Item>
						<List.Item>Restart Anki and keep it open.</List.Item>
					</List>
				</Stack>
			)}

			<Group gap="xs">
				<Button
					disabled={!isConnected || isBusy}
					onClick={() => void dispatch(startAnkiSync())}>
					Sync now
				</Button>
				<Button
					variant="default"
					loading={isSendingRequest}
					onClick={handleTestConnection}>
					Test connection
				</Button>
			</Group>

			<Stack gap="xs">
				<Text size="sm" fw={500}>
					How syncing works
				</Text>
				{SYNC_RULES.map(({ title, items }) => (
					<Stack key={title} gap={2}>
						<Text size="xs" fw={500} c="dimmed" tt="uppercase">
							{title}
						</Text>
						<List size="sm" spacing={2}>
							{items.map(item => (
								<List.Item key={item}>{item}</List.Item>
							))}
						</List>
					</Stack>
				))}
			</Stack>
		</Stack>
	);
}

export default AnkiTab;
