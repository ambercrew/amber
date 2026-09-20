import { useEffect, useState } from "react";
import { Select, Stack } from "@mantine/core";
import AppModal from "../../../components/AppModal/AppModal";
import {
	getEffectiveStudyProfile,
	listStudyProfiles,
} from "../../../api/study/api/studyProfileApi";
import { StudyProfileDto } from "../../../api/study/dto/studyProfileDto";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { closeStudyProfileModal } from "../../../stores/app/appReducer";
import { selectIsStudyProfileModalOpened } from "../../../stores/app/appSelectors";
import { selectCurrentElement } from "../../../stores/elements/elementsSelectors";
import ProfileForm from "./ProfileForm/ProfileForm";
import StudyProfileOption from "./StudyProfileOption";

const CREATE_PROFILE_VALUE = "__create__";

function StudyProfileModal() {
	const opened = useAppSelector(selectIsStudyProfileModalOpened);
	const currentElement = useAppSelector(selectCurrentElement);
	const dispatch = useAppDispatch();
	const [profiles, setProfiles] = useState<StudyProfileDto[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	function refresh(
		pickInitialId?: (list: StudyProfileDto[]) => string | null,
	) {
		void listStudyProfiles().then(list => {
			setProfiles(list);
			setSelectedId(prev => {
				const initialId = pickInitialId?.(list);
				if (initialId && list.some(profile => profile.id === initialId))
					return initialId;
				if (prev && list.some(profile => profile.id === prev))
					return prev;
				return list[0]?.id ?? null;
			});
		});
	}

	useEffect(() => {
		if (!opened) return;

		if (currentElement) {
			void getEffectiveStudyProfile(currentElement.data.meta.elementId)
				.then(effective => refresh(() => effective.profile.id))
				.catch(() =>
					refresh(
						list =>
							list.find(profile => profile.isDefault)?.id ?? null,
					),
				);
		} else {
			refresh(
				list => list.find(profile => profile.isDefault)?.id ?? null,
			);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [opened]);

	const selected =
		profiles.find(profile => profile.id === selectedId) ?? null;

	function handleProfileChange(value: string | null) {
		setSelectedId(value);
	}

	return (
		<AppModal
			opened={opened}
			onClose={() => dispatch(closeStudyProfileModal())}
			fullScreenOnSmallScreen
			title="Study profiles"
			size="lg">
			<Stack gap="md" flex={1} mih={0}>
				<Select
					label="Profile"
					value={selectedId}
					allowDeselect={false}
					withAlignedLabels
					data={[
						...profiles.map(profile => ({
							value: profile.id,
							label: profile.name,
						})),
						{
							value: CREATE_PROFILE_VALUE,
							label: "Create new profile…",
						},
					]}
					renderOption={({ option, checked }) => {
						const profile = profiles.find(
							p => p.id === option.value,
						);
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

				<ProfileForm
					key={selectedId ?? "new"}
					profile={selected}
					onSaved={selectId => refresh(() => selectId ?? null)}
					onSubmitted={() => dispatch(closeStudyProfileModal())}
				/>
			</Stack>
		</AppModal>
	);
}

export default StudyProfileModal;
