import { useCallback, useEffect, useState } from "react";
import { useWindowEvent } from "@mantine/hooks";
import { ActionIcon, Alert, Group, Stack, Text } from "@mantine/core";
import { CaretRightIcon, TargetIcon } from "@phosphor-icons/react";
import { listSavedSearches } from "../../../api/savedSearches/api/savedSearchesApi";
import { SavedSearchResponseDto } from "../../../api/savedSearches/dto/savedSearchResponseDto";
import useApi from "../../../hooks/useApi";
import useAppSelector from "../../../hooks/useAppSelector";
import { useRunCommand } from "../../../commands/useRunCommand";
import { selectStudyScope } from "../../../stores/study/studySelectors";
import { useStudyScopeLabel } from "../../Study/hooks/useStudyScopeLabel";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import { SAVED_SEARCHES_CHANGED } from "../../../types/events/savedSearchesChangedEvent";
import {
	defaultGlobalSyncEventManager,
	ListenerType,
} from "../../../stores/sync/managers/syncEventManager";

const TARGET_ICON_SIZE = 24;
const ACTION_ICON_SIZE = 18;

/** Tells the user the queue is narrowed, with a way to change it. Hidden for everything. */
export default function StudyScopeBanner() {
	const runCommand = useRunCommand();
	const { callApi } = useApi();
	const scope = useAppSelector(selectStudyScope);
	const [savedSearches, setSavedSearches] = useState<
		SavedSearchResponseDto[]
	>([]);
	const label = useStudyScopeLabel(scope, savedSearches);
	const savedSearchId =
		scope?.type === "savedSearch" ? scope.savedSearchId : null;

	// Only a saved search's name needs fetching; refetch when it may be stale.
	const refresh = useCallback(() => {
		if (!savedSearchId) return Promise.resolve();
		return callApi(listSavedSearches).then(result => {
			if (result) setSavedSearches(result);
		});
	}, [savedSearchId, callApi]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	// Renamed or deleted locally, or by another device.
	useWindowEvent(SAVED_SEARCHES_CHANGED, () => void refresh());
	useEffect(() => {
		defaultGlobalSyncEventManager.addListener(
			ListenerType.PostSyncComplete,
			refresh,
		);
		return () =>
			defaultGlobalSyncEventManager.removeListener(
				ListenerType.PostSyncComplete,
				refresh,
			);
	}, [refresh]);

	if (label === null) return null;

	return (
		<Alert
			variant="light"
			p="xs"
			icon={<TargetIcon size={TARGET_ICON_SIZE} />}
			styles={{
				wrapper: { alignItems: "center" },
				// Lets the body shrink below the name's width so it can truncate.
				body: { minWidth: 0 },
			}}>
			<Group justify="space-between" gap="xs" wrap="nowrap">
				<Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
					<Text size="xs" c="dimmed">
						Scoped to
					</Text>
					{/* Long names are cut with an ellipsis; the tooltip always shows them whole. */}
					<AppTooltip label={label} multiline maw={300} touch>
						<Text size="sm" fw={600} truncate>
							{label}
						</Text>
					</AppTooltip>
				</Stack>
				<AppTooltip label="Change study scope">
					<ActionIcon
						variant="subtle"
						aria-label="Change study scope"
						style={{ flexShrink: 0 }}
						onClick={() =>
							runCommand("open-study-session-settings")
						}>
						<CaretRightIcon size={ACTION_ICON_SIZE} />
					</ActionIcon>
				</AppTooltip>
			</Group>
		</Alert>
	);
}
