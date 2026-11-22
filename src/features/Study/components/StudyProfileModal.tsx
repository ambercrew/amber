import { useEffect, useState } from "react";
import { ActionIcon, Group, Select, Stack } from "@mantine/core";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import AppModal from "../../../components/AppModal/AppModal";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import { useIsSmallScreen } from "../../../hooks/useIsSmallScreen";
import {
	getEffectiveStudyProfile,
	listStudyProfiles,
	renameStudyProfile,
} from "../../../api/study/api/studyProfileApi";
import { StudyProfileDto } from "../../../api/study/dto/studyProfileDto";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { closeStudyProfileModal } from "../../../stores/app/appReducer";
import { selectIsStudyProfileModalOpened } from "../../../stores/app/appSelectors";
import { selectCurrentElement } from "../../../stores/elements/elementsSelectors";
import ProfileForm from "./ProfileForm/ProfileForm";
import ProfileNameModal from "./ProfileNameModal";
import StudyProfileOption from "./StudyProfileOption";

const CREATE_PROFILE_VALUE = "__create__";

/** Fixed so switching tabs doesn't resize the dialog; capped to fit short windows under the header. */
const DESKTOP_BODY_HEIGHT = "min(720px, calc(90dvh - 6rem))";

function StudyProfileModal() {
	const opened = useAppSelector(selectIsStudyProfileModalOpened);
	const currentElement = useAppSelector(selectCurrentElement);
	const dispatch = useAppDispatch();
	const isSmallScreen = useIsSmallScreen();
	const [profiles, setProfiles] = useState<StudyProfileDto[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [isRenaming, setIsRenaming] = useState(false);

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

	async function handleRename(name: string) {
		if (!selected) return;
		await renameStudyProfile(selected.id, name);
		refresh();
	}

	return (
		<AppModal
			opened={opened}
			onClose={() => dispatch(closeStudyProfileModal())}
			fullScreenOnSmallScreen
			title="Study profiles"
			size="xl">
			<Stack
				gap="md"
				flex={1}
				mih={0}
				h={isSmallScreen ? undefined : DESKTOP_BODY_HEIGHT}>
				<Group gap="xs" align="flex-end" wrap="nowrap">
					<Select
						flex={1}
						label="Profile"
						value={selectedId}
						allowDeselect={false}
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
					<AppTooltip label="Rename profile">
						<ActionIcon
							variant="default"
							size="input-sm"
							aria-label="Rename profile"
							disabled={!selected}
							onClick={() => setIsRenaming(true)}>
							<PencilSimpleIcon />
						</ActionIcon>
					</AppTooltip>
				</Group>

				<ProfileForm
					key={selectedId ?? "new"}
					profile={selected}
					onSaved={selectId => refresh(() => selectId ?? null)}
					onSubmitted={() => dispatch(closeStudyProfileModal())}
				/>
			</Stack>
			{isRenaming && selected && (
				<ProfileNameModal
					title="Rename profile"
					confirmLabel="Rename"
					initialName={selected.name}
					onClose={() => setIsRenaming(false)}
					onConfirm={handleRename}
				/>
			)}
		</AppModal>
	);
}

export default StudyProfileModal;
