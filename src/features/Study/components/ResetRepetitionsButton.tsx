import { useState } from "react";
import { Button, Text } from "@mantine/core";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { resetRepetitionsBulk } from "../../../api/study/api/studyApi";
import { ElementId } from "../../../types/elements/elementId";
import useApi from "../../../hooks/useApi";
import ConfirmModal from "../../../components/AppModal/ConfirmModal";

interface ResetRepetitionsButtonProps {
	elementId: ElementId;
}

/**
 * Discards a single card's scheduling progress, mirroring the bulk
 * "Reset repetitions" action in the elements browser.
 */
function ResetRepetitionsButton({ elementId }: ResetRepetitionsButtonProps) {
	const [confirmOpened, setConfirmOpened] = useState(false);
	const { callApi, isSendingRequest, errorMessage } = useApi();

	function handleConfirm() {
		void callApi(() => resetRepetitionsBulk([elementId]));
	}

	return (
		<>
			<Button
				variant="default"
				size="xs"
				loading={isSendingRequest}
				leftSection={<ArrowCounterClockwiseIcon size={16} />}
				onClick={() => setConfirmOpened(true)}>
				Reset repetitions
			</Button>
			{errorMessage && (
				<Text size="xs" c="red">
					{errorMessage}
				</Text>
			)}
			<ConfirmModal
				opened={confirmOpened}
				title="Reset repetitions"
				confirmLabel="Reset repetitions"
				confirmColor="red"
				onConfirm={handleConfirm}
				onClose={() => setConfirmOpened(false)}>
				<Text>
					The scheduling progress for this card will be discarded, and
					it will behave as never studied. Its review history is kept.
				</Text>
			</ConfirmModal>
		</>
	);
}

export default ResetRepetitionsButton;
