import { useState } from "react";
import { Button, Divider, Stack, Tabs, Text } from "@mantine/core";
import ModalActions from "../../../../components/AppModal/ModalActions";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import {
	cloneStudyProfile,
	createStudyProfile,
	deleteStudyProfile,
	setDefaultStudyProfile,
	updateStudyProfile,
} from "../../../../api/study/api/studyProfileApi";
import { StudyProfileDto } from "../../../../api/study/dto/studyProfileDto";
import AppTooltip from "../../../../components/AppTooltip/AppTooltip";
import ProfileNameModal from "../ProfileNameModal";
import CardsTab from "./CardsTab";
import QueueTab from "./QueueTab";
import LearningAssetsAndExtractsTab from "./LearningAssetsAndExtractsTab";
import { useFsrsOptimization } from "./useFsrsOptimization";
import {
	VIEW_SLIDE_OFFSET_PX,
	VIEW_TRANSITION_DURATION_MS,
} from "../../../../config/motion";
import { useViewReveal } from "../../../../hooks/useViewReveal";
import {
	FSRS_PARAM_COUNT,
	initialValues,
	isValidFsrsParams,
	isValidCount,
	isValidInitialInterval,
	isValidMaximumInterval,
	MAX_LEECH_THRESHOLD,
	MAX_MAXIMUM_INTERVAL_DAYS,
	MAX_NEW_CARDS_PER_DAY,
	isValidSteps,
	ProfileFormValues,
	toRequestDto,
} from "./profileFormValues";

interface ProfileFormProps {
	profile: StudyProfileDto | null;
	onSaved: (selectId?: string) => void;
	onSubmitted: () => void;
}

type TabValue = "learningAssets" | "cards" | "queue";

const TABS: { value: TabValue; label: string; description: string }[] = [
	{
		value: "learningAssets",
		label: "Learning assets & extracts",
		description:
			"When learning assets and extracts come back into the queue.",
	},
	{
		value: "cards",
		label: "Cards",
		description: "How cards and clozes are reviewed, using FSRS.",
	},
	{
		value: "queue",
		label: "Queue",
		description: "Where new extracts and cards land in the priority queue.",
	},
];

// Which tab owns each validated field, so a failed submit can reveal the error
// rather than leaving it on a tab the user isn't looking at.
const FIELD_TABS: Partial<Record<keyof ProfileFormValues, TabValue>> = {
	initialIntervalDays: "learningAssets",
	initialIntervalMultiplier: "learningAssets",
	minIntervalDays: "learningAssets",
	desiredRetention: "cards",
	fsrsParams: "cards",
	learningSteps: "cards",
	relearningSteps: "cards",
	maximumIntervalDays: "cards",
	newCardsPerDay: "cards",
	cardInitialIntervalDays: "cards",
	leechThreshold: "cards",
	placementPercentile: "queue",
	ceilingPercentile: "queue",
};

function ProfileForm({ profile, onSaved, onSubmitted }: ProfileFormProps) {
	const [tab, setTab] = useState<TabValue>(TABS[0].value);
	// A later tab slides in from the right, an earlier one from the left.
	const [tabDirection, setTabDirection] = useState<1 | -1>(1);
	function selectTab(next: TabValue) {
		const index = (value: TabValue) =>
			TABS.findIndex(candidate => candidate.value === value);
		setTabDirection(index(next) < index(tab) ? -1 : 1);
		setTab(next);
	}
	const tabStyle = useViewReveal(tab, {
		offsetX: tabDirection * VIEW_SLIDE_OFFSET_PX,
		durationMs: VIEW_TRANSITION_DURATION_MS,
	});
	const form = useForm<ProfileFormValues>({
		initialValues: initialValues(profile),
		validate: {
			fsrsParams: value =>
				isValidFsrsParams(value)
					? null
					: `Enter exactly ${FSRS_PARAM_COUNT} comma-separated numbers`,
			learningSteps: value =>
				isValidSteps(value)
					? null
					: "Each space-separated step must be a number followed by m, h or d (e.g. 1m 10m 1d)",
			relearningSteps: value =>
				isValidSteps(value)
					? null
					: "Each space-separated step must be a number followed by m, h or d (e.g. 1m 10m 1d)",
			maximumIntervalDays: value =>
				isValidMaximumInterval(value)
					? null
					: `Enter a whole number of days from 1 to ${MAX_MAXIMUM_INTERVAL_DAYS}`,
			initialIntervalDays: value =>
				isValidInitialInterval(value)
					? null
					: `Enter a number of days from 0 to ${MAX_MAXIMUM_INTERVAL_DAYS}`,
			cardInitialIntervalDays: value =>
				isValidInitialInterval(value)
					? null
					: `Enter a number of days from 0 to ${MAX_MAXIMUM_INTERVAL_DAYS}`,
			newCardsPerDay: value =>
				isValidCount(value, MAX_NEW_CARDS_PER_DAY)
					? null
					: `Enter a whole number from 0 to ${MAX_NEW_CARDS_PER_DAY}`,
			leechThreshold: value =>
				isValidCount(value, MAX_LEECH_THRESHOLD)
					? null
					: `Enter a whole number from 0 to ${MAX_LEECH_THRESHOLD}`,
		},
	});

	const optimization = useFsrsOptimization(form, profile?.id ?? null);

	// A new profile is named once its fields are valid, just before it's created.
	const [pendingCreate, setPendingCreate] =
		useState<ProfileFormValues | null>(null);

	async function handleSubmit(values: ProfileFormValues) {
		if (!profile) {
			setPendingCreate(values);
			return;
		}
		await updateStudyProfile(
			profile.id,
			toRequestDto(values, profile.name),
		);
		onSaved();
		onSubmitted();
	}

	async function handleCreate(values: ProfileFormValues, name: string) {
		await createStudyProfile(toRequestDto(values, name));
		onSaved();
		onSubmitted();
	}

	function handleErrors(errors: typeof form.errors) {
		const firstInvalid = Object.keys(errors)[0] as
			keyof ProfileFormValues | undefined;
		const owner = firstInvalid && FIELD_TABS[firstInvalid];
		if (owner) selectTab(owner);
	}

	async function handleClone() {
		if (!profile) return;
		const cloned = await cloneStudyProfile(profile.id);
		onSaved(cloned.id);
	}

	function handleDelete() {
		if (!profile) return;
		modals.openConfirmModal({
			title: "Delete profile",
			children: (
				<Text>
					Are you sure you want to delete &quot;{profile.name}
					&quot;? This cannot be undone.
				</Text>
			),
			labels: { confirm: "Delete", cancel: "Cancel" },
			confirmProps: { color: "red" },
			centered: true,
			onConfirm: () => {
				void deleteStudyProfile(profile.id).then(() => onSaved());
			},
		});
	}

	async function handleSetDefault() {
		if (!profile) return;
		await setDefaultStudyProfile(profile.id);
		onSaved();
	}

	return (
		<form
			onSubmit={form.onSubmit(
				values => void handleSubmit(values),
				handleErrors,
			)}
			style={{
				display: "flex",
				flexDirection: "column",
				flex: 1,
				minHeight: 0,
			}}>
			<Stack gap="sm" flex={1} mih={0}>
				{/* Only the open tab scrolls, keeping the buttons at the bottom. */}
				<Tabs
					value={tab}
					onChange={value => value && selectTab(value as TabValue)}
					style={{
						display: "flex",
						flexDirection: "column",
						flex: 1,
						minHeight: 0,
					}}>
					<Tabs.List grow>
						{TABS.map(({ value, label }) => (
							<Tabs.Tab key={value} value={value}>
								{label}
							</Tabs.Tab>
						))}
					</Tabs.List>

					{TABS.map(({ value, description }) => (
						// Hides the sideways slide so it doesn't flash a scrollbar; the gutter keeps focus rings visible.
						<Tabs.Panel
							key={value}
							value={value}
							pt="sm"
							pb={4}
							mx={-4}
							px={4}
							style={{
								flex: 1,
								minHeight: 0,
								overflowX: "hidden",
								overflowY: "auto",
							}}>
							<Stack gap="sm" style={tabStyle}>
								<Text size="sm" c="dimmed">
									{description}
								</Text>
								{value === "cards" && (
									<CardsTab
										form={form}
										optimization={
											profile ? optimization : null
										}
									/>
								)}
								{value === "learningAssets" && (
									<LearningAssetsAndExtractsTab form={form} />
								)}
								{value === "queue" && <QueueTab form={form} />}
							</Stack>
						</Tabs.Panel>
					))}
				</Tabs>

				<Divider />

				<ModalActions
					start={
						profile && (
							<>
								<Button
									type="button"
									variant="default"
									size="sm"
									onClick={() => void handleClone()}>
									Clone
								</Button>
								{!profile.isDefault && (
									<AppTooltip
										label="Makes this the default profile. Default status can only be moved to another profile, never simply turned off."
										multiline>
										<Button
											type="button"
											variant="default"
											size="sm"
											onClick={() =>
												void handleSetDefault()
											}>
											Make default
										</Button>
									</AppTooltip>
								)}
								{!profile.isDefault && (
									<Button
										type="button"
										variant="subtle"
										color="red"
										size="sm"
										onClick={handleDelete}>
										Delete
									</Button>
								)}
							</>
						)
					}>
					<Button type="submit" size="sm">
						{profile ? "Save" : "Create"}
					</Button>
				</ModalActions>
			</Stack>
			{pendingCreate && (
				<ProfileNameModal
					title="Name the new profile"
					confirmLabel="Create"
					initialName="New profile"
					onClose={() => setPendingCreate(null)}
					onConfirm={name => handleCreate(pendingCreate, name)}
				/>
			)}
		</form>
	);
}

export default ProfileForm;
