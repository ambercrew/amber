import { useEffect, useRef, useState } from "react";
import { Button, Group, Text } from "@mantine/core";
import AppModal from "../../../components/AppModal/AppModal";
import AutosizeTextInput from "../../../components/AutosizeTextInput/AutosizeTextInput";
import useApi from "../../../hooks/useApi";

interface ProfileNameModalProps {
	title: string;
	confirmLabel: string;
	initialName: string;
	onClose: () => void;
	/** Saves the name; the modal closes once it resolves, and shows why if it throws. */
	onConfirm: (name: string) => Promise<void>;
}

/** Asks for a study profile's name, when renaming or creating one. Mount it only while open. */
function ProfileNameModal({
	title,
	confirmLabel,
	initialName,
	onClose,
	onConfirm,
}: ProfileNameModalProps) {
	const [name, setName] = useState(initialName);
	const { isSendingRequest, errorMessage, callApi } = useApi();
	const inputRef = useRef<HTMLTextAreaElement>(null);

	// Mounted already open, so there's no enter transition to select from; `data-autofocus` focuses the input.
	useEffect(() => {
		const id = setTimeout(() => inputRef.current?.select(), 0);
		return () => clearTimeout(id);
	}, []);

	async function handleConfirm() {
		const trimmed = name.trim();
		if (!trimmed || isSendingRequest) return;
		const saved = await callApi(async () => {
			await onConfirm(trimmed);
			return true;
		});
		if (saved) onClose();
	}

	return (
		<AppModal opened onClose={onClose} title={title}>
			<AutosizeTextInput
				ref={inputRef}
				data-autofocus
				aria-label="Profile name"
				value={name}
				onChange={e => setName(e.currentTarget.value)}
				onKeyDown={e => {
					if (e.key !== "Enter") return;
					e.preventDefault();
					void handleConfirm();
				}}
			/>
			{errorMessage && (
				<Text size="sm" c="red" mt="xs">
					{errorMessage}
				</Text>
			)}
			<Group justify="flex-end" gap="xs" mt="sm">
				<Button variant="default" onClick={onClose}>
					Cancel
				</Button>
				<Button
					onClick={() => void handleConfirm()}
					loading={isSendingRequest}
					disabled={!name.trim()}>
					{confirmLabel}
				</Button>
			</Group>
		</AppModal>
	);
}

export default ProfileNameModal;
