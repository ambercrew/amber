import { useEffect, useRef, useState } from "react";
import { Button, Group } from "@mantine/core";
import AppModal from "../../../../components/AppModal/AppModal";
import AutosizeTextInput from "../../../../components/AutosizeTextInput/AutosizeTextInput";

interface RenameSavedSearchModalProps {
	opened: boolean;
	initialName: string;
	onClose: () => void;
	onConfirm: (newName: string) => void;
}

function RenameSavedSearchModal({
	opened,
	initialName,
	onClose,
	onConfirm,
}: RenameSavedSearchModalProps) {
	const [name, setName] = useState(initialName);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	// Mounted already open, so there's no enter transition to focus from; `data-autofocus` steers Mantine's
	// FocusTrap to the input instead of the close button, and we select the text once it's focused.
	useEffect(() => {
		const id = setTimeout(() => inputRef.current?.select(), 0);
		return () => clearTimeout(id);
	}, []);

	function handleConfirm() {
		const trimmed = name.trim();
		if (trimmed) onConfirm(trimmed);
		onClose();
	}

	return (
		<AppModal
			opened={opened}
			onClose={onClose}
			title="Rename search"
			onExitTransitionEnd={() => setName(initialName)}>
			<AutosizeTextInput
				ref={inputRef}
				data-autofocus
				value={name}
				onChange={e => setName(e.currentTarget.value)}
				onKeyDown={e => {
					if (e.key === "Enter") handleConfirm();
				}}
			/>
			<Group justify="flex-end" gap="xs" mt="sm">
				<Button variant="default" onClick={onClose}>
					Cancel
				</Button>
				<Button onClick={handleConfirm} disabled={!name.trim()}>
					Rename
				</Button>
			</Group>
		</AppModal>
	);
}

export default RenameSavedSearchModal;
