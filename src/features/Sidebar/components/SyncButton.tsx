import { ActionIcon } from "@mantine/core";
import { commandIcon } from "../../../commands/commandIcon";
import { useRunCommand } from "../../../commands/useRunCommand";
import useAppSelector from "../../../hooks/useAppSelector";
import { selectIsSyncing } from "../../../stores/sync/syncSelector";
import {
	selectIsSignedIn,
	selectUserInformation,
} from "../../../stores/user/userSelectors";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";

function SyncButton() {
	const run = useRunCommand();
	const isSyncing = useAppSelector(selectIsSyncing);
	const isSignedIn = useAppSelector(selectIsSignedIn);
	const isEmailVerified = useAppSelector(
		state => selectUserInformation(state)?.isEmailVerified,
	);

	if (!isSignedIn || !isEmailVerified) return null;

	return (
		<AppTooltip label={isSyncing ? "Syncing..." : "Sync"}>
			<ActionIcon
				variant="subtle"
				color="gray"
				loading={isSyncing}
				size="lg"
				disabled={isSyncing}
				onClick={() => run("sync")}
				aria-label="Sync">
				{commandIcon("sync")}
			</ActionIcon>
		</AppTooltip>
	);
}

export default SyncButton;
