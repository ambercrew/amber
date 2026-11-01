import { useEffect, useState } from "react";
import {
	Alert,
	Button,
	Divider,
	Group,
	Slider,
	Stack,
	Text,
} from "@mantine/core";
import AppModal from "../../../components/AppModal/AppModal";
import useApi from "../../../hooks/useApi";
import { getFuzzFactor, setFuzzFactor } from "../../../api/study/api/studyApi";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { closeStudySessionSettingsModal } from "../../../stores/app/appReducer";
import { selectIsStudySessionSettingsModalOpened } from "../../../stores/app/appSelectors";
import { STUDY_SESSION_SETTINGS_CHANGED } from "../../../types/events/studySessionSettingsChangedEvent";
import { listSavedSearches } from "../../../api/savedSearches/api/savedSearchesApi";
import { SavedSearchResponseDto } from "../../../api/savedSearches/dto/savedSearchResponseDto";
import { StudyScopeDto } from "../../../api/study/dto/studyScopeDto";
import { changeStudyScopeAction } from "../../../stores/study/studyScopeActions";
import {
	selectStudyScope,
	selectStudyStatus,
} from "../../../stores/study/studySelectors";
import StudyScopeSettings from "./StudyScopeSettings";
import { useRecentCustomQueries } from "../hooks/useRecentCustomQueries";

function StudySessionSettingsModal() {
	const opened = useAppSelector(selectIsStudySessionSettingsModalOpened);
	const dispatch = useAppDispatch();

	const studyScope = useAppSelector(selectStudyScope);
	const isStudying = useAppSelector(selectStudyStatus) === "studying";
	const { remember } = useRecentCustomQueries();
	const {
		callApi: callLoadApi,
		errorMessage: loadError,
		clearErrorMessage: clearLoadError,
	} = useApi();
	const {
		callApi: callApplyApi,
		errorMessage: applyError,
		isSendingRequest: isApplying,
		clearErrorMessage: clearApplyError,
	} = useApi();

	const [fuzzFactor, setLocalFuzzFactor] = useState<number | null>(null);
	// Edited here and only committed on Apply, like the fuzz factor.
	const [scopeDraft, setScopeDraft] = useState<StudyScopeDto | null>(null);
	const [savedSearches, setSavedSearches] = useState<
		SavedSearchResponseDto[]
	>([]);

	useEffect(() => {
		if (!opened) return;
		clearLoadError();
		clearApplyError();
		void callLoadApi(async () => {
			const [loadedFuzzFactor, loadedSavedSearches] = await Promise.all([
				getFuzzFactor(),
				listSavedSearches(),
			]);
			setLocalFuzzFactor(loadedFuzzFactor);
			setSavedSearches(loadedSavedSearches);
			setScopeDraft(studyScope);
		});
		// The draft starts from the scope at the moment the modal opens.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [opened]);

	function handleClose() {
		dispatch(closeStudySessionSettingsModal());
	}

	function handleApply() {
		if (fuzzFactor === null) return;
		// A query without filters matches everything, so store it as no scope.
		const scope =
			scopeDraft?.type === "custom" && scopeDraft.filters.length === 0
				? null
				: scopeDraft;
		void callApplyApi(async () => {
			await setFuzzFactor(fuzzFactor);
			dispatch(changeStudyScopeAction(scope));
			if (scope?.type === "custom") remember(scope.filters);
			window.dispatchEvent(new Event(STUDY_SESSION_SETTINGS_CHANGED));
			handleClose();
		});
	}

	return (
		<AppModal
			opened={opened}
			onClose={handleClose}
			title="Study session settings"
			size="lg">
			{loadError ? (
				<Alert color="red" title="Couldn't load the settings">
					{loadError}
				</Alert>
			) : fuzzFactor === null ? (
				<Text size="sm" c="dimmed">
					Loading…
				</Text>
			) : (
				<Stack gap="lg">
					<Stack gap={4}>
						<Text size="sm" fw={500}>
							Degree of randomization
						</Text>
						<Text size="xs" c="dimmed">
							0 keeps the due queue in strict priority order, 100
							shuffles it entirely.
						</Text>
						<Slider
							value={fuzzFactor}
							onChange={setLocalFuzzFactor}
							min={0}
							max={100}
							label={value => `${value}%`}
						/>
					</Stack>
					<Divider />
					<StudyScopeSettings
						value={scopeDraft}
						onChange={setScopeDraft}
						savedSearches={savedSearches}
						onSavedSearchCreated={savedSearch =>
							setSavedSearches(current => [
								...current,
								savedSearch,
							])
						}
						disabled={isStudying}
					/>
					{applyError && (
						<Alert color="red" title="Couldn't apply the settings">
							{applyError}
						</Alert>
					)}
					<Group justify="flex-end">
						<Button variant="default" onClick={handleClose}>
							Cancel
						</Button>
						<Button onClick={handleApply} loading={isApplying}>
							Apply
						</Button>
					</Group>
				</Stack>
			)}
		</AppModal>
	);
}

export default StudySessionSettingsModal;
