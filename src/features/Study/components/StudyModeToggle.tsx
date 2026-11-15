import { Switch } from "@mantine/core";
import { BookOpenIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { useRunCommand } from "../../../commands/useRunCommand";
import useAppSelector from "../../../hooks/useAppSelector";
import { selectStudyStatus } from "../../../stores/study/studySelectors";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import { TOGGLE_STUDY_SESSION_SHORTCUT } from "../../../config/shortcuts";

// Shows the mode, not the action, so it keeps its own icons rather than the commands'.
function StudyModeToggle() {
	const run = useRunCommand();
	const status = useAppSelector(selectStudyStatus);

	const studying = status === "studying";

	return (
		<AppTooltip
			label={studying ? "End study session" : "Start study session"}
			shortcut={TOGGLE_STUDY_SESSION_SHORTCUT}
			refProp="rootRef">
			<Switch
				size="lg"
				checked={studying}
				withThumbIndicator={false}
				onLabel={<BookOpenIcon size={16} />}
				offLabel={<PencilSimpleIcon size={16} />}
				onChange={() =>
					run(studying ? "enter-edit-mode" : "enter-study-mode")
				}
			/>
		</AppTooltip>
	);
}

export default StudyModeToggle;
