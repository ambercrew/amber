import { useRef, useState } from "react";
import { Button, Group } from "@mantine/core";
import AppModal from "../../../../components/AppModal/AppModal";
import AutosizeTextInput from "../../../../components/AutosizeTextInput/AutosizeTextInput";

interface SaveSavedSearchModalProps {
	opened: boolean;
	onClose: () => void;
	onConfirm: (name: string) => void;
}

function SaveSavedSearchModal({
	opened,
	onClose,
	onConfirm,
}: SaveSavedSearchModalProps) {
	const [name, setName] = useState("");
	const inputRef = useRef<HTMLTextAreaElement>(null);

	function handleConfirm() {
		const trimmed = name.trim();
		if (trimmed) onConfirm(trimmed);
		onClose();
	}

	return (
		<AppModal
			opened={opened}
			onClose={onClose}
			title="Save search"
			onExitTransitionEnd={() => setName("")}
			onEnterTransitionEnd={() => inputRef.current?.focus()}>
			<AutosizeTextInput
				ref={inputRef}
				autoFocus
				placeholder="Search name"
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
					Save
				</Button>
			</Group>
		</AppModal>
	);
}

export default SaveSavedSearchModal;
