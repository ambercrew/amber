import { Button, Group } from "@mantine/core";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import { useRunCommand } from "../../../commands/useRunCommand";
import {
	RETURN_TO_STUDY_SESSION_SHORTCUT,
	TOGGLE_STUDY_SESSION_SHORTCUT,
} from "../../../config/shortcuts";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { useElementParams } from "../../../hooks/useElementParams";
import { sessionElementShown } from "../../../stores/study/studyReducer";
import { elementKey } from "../../../utils/elementKey";
import {
	selectStudyQueuedKeys,
	selectStudyReturnItem,
} from "../../../stores/study/studySelectors";
import SessionBarFrame from "./SessionBarFrame";

/** Shown while the user is away from the element under review; Return says so without a label. Text-only, like the review buttons. */
function AwayStudySessionBar() {
	const dispatch = useAppDispatch();
	const runCommand = useRunCommand();
	const openElement = useElementParams();
	const returnItem = useAppSelector(selectStudyReturnItem);
	const queuedKeys = useAppSelector(selectStudyQueuedKeys);
	// A due element visited from elsewhere can become the one under review.
	const reviewable =
		openElement && queuedKeys.has(elementKey(openElement))
			? openElement
			: null;

	// The frame's clock keeps running: a detour is part of the element's review.
	return (
		<SessionBarFrame>
			<Group gap="xs" wrap="nowrap" align="flex-end">
				{reviewable && (
					<AppTooltip touch label="Review this element now">
						<Button
							variant="default"
							size="sm"
							onClick={() =>
								dispatch(
									sessionElementShown({
										elementId: reviewable,
									}),
								)
							}>
							Review
						</Button>
					</AppTooltip>
				)}
				<AppTooltip
					touch
					label={returnItem && `Return to “${returnItem.title}”`}
					shortcut={RETURN_TO_STUDY_SESSION_SHORTCUT}
					multiline
					maw={320}>
					<Button
						variant="default"
						size="sm"
						onClick={() => runCommand("return-to-study-session")}>
						Return
					</Button>
				</AppTooltip>
				<AppTooltip
					touch
					label="End study session"
					shortcut={TOGGLE_STUDY_SESSION_SHORTCUT}>
					<Button
						variant="default"
						size="sm"
						onClick={() => runCommand("enter-edit-mode")}>
						End session
					</Button>
				</AppTooltip>
			</Group>
		</SessionBarFrame>
	);
}

export default AwayStudySessionBar;
