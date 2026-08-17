import { Button, Group, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { useNavigate } from "react-router";
import useAppDispatch from "../../../hooks/useAppDispatch";
import { closeManageAccountModal } from "../../../stores/app/appReducer";
import { deleteAccount } from "../../../stores/user/userActions";
import DeleteAccountModal from "./DeleteAccountModal";

function DangerZoneTab() {
	const dispatch = useAppDispatch();
	const navigate = useNavigate();
	const [deleteModalOpened, setDeleteModalOpened] = useState(false);

	async function handleAccountDeleted() {
		await dispatch(deleteAccount(navigate));
		setDeleteModalOpened(false);
		dispatch(closeManageAccountModal());
	}

	return (
		<Stack gap="sm" pt="md">
			<Text size="sm" c="dimmed">
				Deleting your account permanently removes your data from our
				servers. This cannot be undone.
			</Text>
			<Group justify="flex-end">
				<Button
					type="button"
					color="red"
					variant="light"
					onClick={() => setDeleteModalOpened(true)}>
					Delete account
				</Button>
			</Group>
			<DeleteAccountModal
				opened={deleteModalOpened}
				onClose={() => setDeleteModalOpened(false)}
				onDeleted={handleAccountDeleted}
			/>
		</Stack>
	);
}

export default DangerZoneTab;
