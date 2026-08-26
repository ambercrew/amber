import { ActionIcon, Group, Select, Tooltip } from "@mantine/core";
import { assignStudyProfile } from "../../../api/study/api/studyProfileApi";
import { STUDY_PROFILES_CHANGED_EVENT } from "../../../api/study/events/studyProfilesChangedEvent";
import { ElementDetailsResponseDto } from "../../../api/elements/dto/elementDetailsDto";
import useApi from "../../../hooks/useApi";
import useAppDispatch from "../../../hooks/useAppDispatch";
import { useTauriEvent } from "../../../hooks/useTauriEvent";
import { openStudyProfileModal } from "../../../stores/app/appReducer";
import { loadElementDetailsAction } from "../../../stores/elementDetails/elementDetailsActions";
import { ElementId } from "../../../types/elements/elementId";
import { commandIcon } from "../../../commands/commandIcon";
import StudyProfileOption from "./StudyProfileOption";

interface ElementProfileRowProps {
	elementId: ElementId;
	details: ElementDetailsResponseDto | null;
}

const INHERIT_VALUE = "__inherit__";

function ElementProfileRow({ elementId, details }: ElementProfileRowProps) {
	const dispatch = useAppDispatch();
	const { callApi } = useApi();
	const profiles = details?.profiles ?? [];
	const effective = details?.effectiveProfile ?? null;
	const inheritedName = details?.inheritedProfileName ?? null;

	function handleProfileChange(value: string | null) {
		void callApi(async () => {
			const profileId = value === INHERIT_VALUE ? null : value;
			await assignStudyProfile(elementId, profileId);
			await dispatch(loadElementDetailsAction(elementId));
		});
	}

	useTauriEvent(STUDY_PROFILES_CHANGED_EVENT, () => {
		void dispatch(loadElementDetailsAction(elementId));
	});

	const selectValue =
		effective?.source === "direct" ? effective.profile.id : INHERIT_VALUE;

	const inheritLabel = inheritedName
		? `Inherit from parent (${inheritedName})`
		: "Inherit from parent";

	return (
		<Group gap={4} wrap="nowrap" align="center">
			<Select
				size="sm"
				value={selectValue}
				withAlignedLabels
				flex={1}
				data={[
					{ value: INHERIT_VALUE, label: inheritLabel },
					...profiles.map(profile => ({
						value: profile.id,
						label: profile.name,
					})),
				]}
				styles={{
					input: {
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
						overflow: "hidden",
					},
				}}
				comboboxProps={{
					floatingStrategy: "fixed",
				}}
				renderOption={({ option, checked }) => {
					const profile = profiles.find(p => p.id === option.value);
					return (
						<StudyProfileOption
							label={option.label}
							isDefault={profile?.isDefault ?? false}
							checked={checked ?? false}
						/>
					);
				}}
				nothingFoundMessage="Nothing found..."
				onChange={handleProfileChange}
			/>
			<Tooltip label="Manage study profiles">
				<ActionIcon
					variant="subtle"
					onClick={() => dispatch(openStudyProfileModal())}>
					{commandIcon("manage-study-profiles")}
				</ActionIcon>
			</Tooltip>
		</Group>
	);
}

export default ElementProfileRow;
