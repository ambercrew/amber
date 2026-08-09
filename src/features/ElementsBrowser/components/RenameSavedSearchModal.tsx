import { useEffect, useRef, useState } from "react";
import { Button, Group } from "@mantine/core";
import AppModal from "../../../components/AppModal/AppModal";
import AutosizeTextInput from "../../../components/AutosizeTextInput/AutosizeTextInput";

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

	// TODO: not working
	useEffect(() => {
		// The menu that opens this modal moves focus away from the input
		// with auto-focus property.
		const id = setTimeout(() => {
			inputRef.current?.focus();
			inputRef.current?.select();
		}, 0);
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
