import { Button, Group, Loader, Stack, Text } from "@mantine/core";
import AppModal from "../../../components/AppModal/AppModal";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import {
	closeWithoutWaitingRequested,
	keepWorkingRequested,
} from "../../../stores/sync/syncReducer";
import { selectIsFinishingBeforeClose } from "../../../stores/sync/syncSelectors";

/** Shown only while closing waits on a sync; any other sync runs in the background. */
function SyncingModal() {
	const isFinishing = useAppSelector(selectIsFinishingBeforeClose);
	const dispatch = useAppDispatch();
	// Dismissing the dialog keeps the app open; only the button below closes it without waiting.
	const keepWorking = () => dispatch(keepWorkingRequested());

	return (
		<AppModal
			opened={isFinishing}
			onClose={keepWorking}
			closeOnClickOutside={false}>
			<Stack align="center">
				<Loader size="lg" />
				<Text>Syncing, please wait...</Text>
				<Text size="sm" c="dimmed" ta="center">
					Closing now is safe: the next sync continues where this one
					stopped. Or keep working while it finishes in the
					background.
				</Text>
				<Group>
					<Button variant="default" onClick={keepWorking}>
						Keep working
					</Button>
					<Button
						variant="default"
						onClick={() =>
							dispatch(closeWithoutWaitingRequested())
						}>
						Close without waiting
					</Button>
				</Group>
			</Stack>
		</AppModal>
	);
}

export default SyncingModal;
