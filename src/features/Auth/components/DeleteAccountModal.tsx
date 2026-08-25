import {
	Alert,
	Button,
	Checkbox,
	Group,
	Stack,
	Text,
	TextInput,
} from "@mantine/core";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import AppModal from "../../../components/AppModal/AppModal";
import useApi from "../../../hooks/useApi";

const CONFIRMATION_PHRASE = "delete my account";

interface DeleteAccountModalProps {
	opened: boolean;
	onClose: () => void;
	onDeleted: () => Promise<void>;
}

function DeleteAccountModal({
	opened,
	onClose,
	onDeleted,
}: DeleteAccountModalProps) {
	const { callApi, isSendingRequest, errorMessage, clearErrorMessage } =
		useApi();
	const [confirmationText, setConfirmationText] = useState("");
	const [acknowledged, setAcknowledged] = useState(false);

	const canDelete =
		confirmationText.trim().toLowerCase() === CONFIRMATION_PHRASE &&
		acknowledged;

	function handleClose() {
		if (isSendingRequest) return;
		setConfirmationText("");
		setAcknowledged(false);
		clearErrorMessage();
		onClose();
	}

	async function handleDelete() {
		await callApi(async () => {
			await onDeleted();
		});
	}

	return (
		<AppModal
			opened={opened}
			onClose={handleClose}
			title="Delete account"
			closeOnEscape={!isSendingRequest}
			size="sm">
			<Stack gap="sm">
				<Text size="sm">
					This permanently deletes your account and all of your data
					from our servers. This cannot be undone.
				</Text>
				{errorMessage && (
					<Alert color="red" icon={<WarningCircleIcon />}>
						{errorMessage}
					</Alert>
				)}
				<TextInput
					label={`Type "${CONFIRMATION_PHRASE}" to confirm`}
					value={confirmationText}
					onChange={event =>
						setConfirmationText(event.currentTarget.value)
					}
					autoFocus
					disabled={isSendingRequest}
				/>
				<Checkbox
					label="I understand this action is permanent and cannot be undone"
					checked={acknowledged}
					onChange={event =>
						setAcknowledged(event.currentTarget.checked)
					}
					disabled={isSendingRequest}
				/>
				<Group justify="flex-end" mt="xs">
					<Button
						type="button"
						variant="default"
						onClick={handleClose}
						disabled={isSendingRequest}>
						Cancel
					</Button>
					<Button
						type="button"
						color="red"
						onClick={() => void handleDelete()}
						loading={isSendingRequest}
						disabled={!canDelete}>
						Delete account
					</Button>
				</Group>
			</Stack>
		</AppModal>
	);
}

export default DeleteAccountModal;
