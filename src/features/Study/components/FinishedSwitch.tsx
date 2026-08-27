import { Switch } from "@mantine/core";
import {
	finishLearningAsset,
	unfinishLearningAsset,
} from "../../../api/study/api/studyApi";
import { LearningAssetReviewDto } from "../../../api/study/dto/learningAssetReviewDto";
import useOptimisticField from "../../../hooks/useOptimisticField";
import { ElementId } from "../../../types/elements/elementId";

interface FinishedSwitchProps {
	elementId: ElementId;
	finished: boolean;
	size?: "xs" | "sm";
	ariaLabel?: string;
	onChanged?: (review: LearningAssetReviewDto) => void;
}

function FinishedSwitch({
	elementId,
	finished,
	size = "sm",
	ariaLabel = "Finished",
	onChanged,
}: FinishedSwitchProps) {
	const {
		value: checked,
		persist,
		errorMessage,
	} = useOptimisticField(finished);

	function handleChange(next: boolean) {
		persist(next, async () => {
			const review = next
				? await finishLearningAsset(elementId)
				: await unfinishLearningAsset(elementId);
			onChanged?.(review);
		});
	}

	return (
		<Switch
			size={size}
			aria-label={ariaLabel}
			checked={checked}
			onChange={event => handleChange(event.currentTarget.checked)}
			error={errorMessage}
		/>
	);
}

export default FinishedSwitch;
