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

	// The modal mounts already opened (see SavedSearchSelector), so Mantine's
	// enter transition never fires and can't be used to focus the input.
	// `data-autofocus` is what Mantine's FocusTrap looks for instead; without
	// it, the trap sends focus to the close button, which also races a plain
	// mount effect since the trap grabs focus twice (ref callback + its own
	// mount effect). We still select the text ourselves once focused.
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
