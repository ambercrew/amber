import { Loader, Stack, Text } from "@mantine/core";
import AppModal from "../../../components/AppModal/AppModal";
import useAppSelector from "../../../hooks/useAppSelector";
import { selectIsSyncing } from "../../../stores/sync/syncSelector";

function SyncingModal() {
	const isSyncing = useAppSelector(selectIsSyncing);

	return (
		<AppModal
			opened={isSyncing}
			onClose={() => {
				/* Empty */
			}}
			withCloseButton={false}
			closeOnClickOutside={false}
			closeOnEscape={false}>
			<Stack align="center">
				<Loader size="lg" />
				<Text>Syncing, please wait...</Text>
			</Stack>
		</AppModal>
	);
}

export default SyncingModal;
