import { Button, Group } from "@mantine/core";
import { ReactNode } from "react";
import AppModal from "./AppModal";

interface ConfirmModalProps {
	opened: boolean;
	title: string;
	/** Label of the button that goes ahead with the action. */
	confirmLabel: string;
	/** Mantine color for the confirm button — "red" for destructive actions. */
	confirmColor?: string;
	/** Disables the confirm button, e.g. while the form is incomplete. */
	confirmDisabled?: boolean;
	/** What is about to happen, shown above the buttons. */
	children: ReactNode;
	onConfirm: () => void;
	onClose: () => void;
}

/**
 * A yes/no dialog on {@link AppModal}, for the back button and escape handling `modals.openConfirmModal`
 * misses; a dialog on every viewport, as a short question can't fill a screen.
 */
function ConfirmModal({
	opened,
	title,
	confirmLabel,
	confirmColor,
	confirmDisabled,
	children,
	onConfirm,
	onClose,
}: ConfirmModalProps) {
	function handleConfirm() {
		onConfirm();
		onClose();
	}

	return (
		<AppModal opened={opened} onClose={onClose} title={title}>
			{children}
			<Group justify="flex-end" gap="xs" mt="sm">
				<Button variant="default" onClick={onClose}>
					Cancel
				</Button>
				<Button
					color={confirmColor}
					disabled={confirmDisabled}
					onClick={handleConfirm}>
					{confirmLabel}
				</Button>
			</Group>
		</AppModal>
	);
}

export default ConfirmModal;
