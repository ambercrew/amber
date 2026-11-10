import { Button, Group, Progress, Stack, Text } from "@mantine/core";
import {
	AnkiSyncProgressEventDto,
	AnkiSyncStage,
} from "../../../api/ankiSync/events/ankiSyncProgressEvent";

const STAGE_LABELS: Record<AnkiSyncStage, string> = {
	deleting: "Applying deletions",
	importing: "Importing cards from Anki",
	sending: "Preparing cards for Anki",
	reviews: "Syncing reviews",
};

interface AnkiSyncProgressProps {
	progress: AnkiSyncProgressEventDto | null;
	onCancel: () => void;
}

function AnkiSyncProgress({ progress, onCancel }: AnkiSyncProgressProps) {
	const total = progress?.total ?? 0;
	const current = Math.min(progress?.current ?? 0, total);
	const label = progress ? STAGE_LABELS[progress.stage] : "Syncing with Anki";

	return (
		<Stack gap="xs">
			<Text size="sm">
				{total > 0 ? `${label}: ${current} of ${total}` : `${label}…`}
			</Text>
			<Progress
				value={total > 0 ? (current / total) * 100 : 100}
				animated={total === 0}
				aria-label={label}
			/>
			<Group justify="flex-end">
				<Button size="compact-xs" variant="default" onClick={onCancel}>
					Cancel
				</Button>
			</Group>
		</Stack>
	);
}

export default AnkiSyncProgress;
