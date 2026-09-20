import { useState } from "react";
import {
	Button,
	Divider,
	Group,
	ScrollArea,
	SegmentedControl,
	Stack,
	Text,
	TextInput,
} from "@mantine/core";
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
import FieldLabel from "../../../../components/FieldLabel/FieldLabel";
import CardsTab from "./CardsTab";
import QueueTab from "./QueueTab";
import LearningAssetsAndExtractsTab from "./LearningAssetsAndExtractsTab";
import {
	FSRS_PARAM_COUNT,
	initialValues,
	isValidFsrsParams,
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
	placementPercentile: "queue",
	ceilingPercentile: "queue",
};

function ProfileForm({ profile, onSaved, onSubmitted }: ProfileFormProps) {
	const [tab, setTab] = useState<TabValue>(TABS[0].value);
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
		},
	});

	const description = TABS.find(entry => entry.value === tab)?.description;

	async function handleSubmit(values: ProfileFormValues) {
		const payload = toRequestDto(values);
		if (profile) {
			await updateStudyProfile(profile.id, payload);
		} else {
			await createStudyProfile(payload);
		}
		onSaved();
		onSubmitted();
	}

	function handleErrors(errors: typeof form.errors) {
		const firstInvalid = Object.keys(errors)[0] as
			keyof ProfileFormValues | undefined;
		const owner = firstInvalid && FIELD_TABS[firstInvalid];
		if (owner) setTab(owner);
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
			style={{ display: "flex", flexDirection: "column", flex: 1 }}>
			<Stack gap="sm" flex={1}>
				<TextInput
					label={
						<FieldLabel
							label="Name"
							tooltip="A label to identify this profile."
						/>
					}
					{...form.getInputProps("name")}
				/>

				<SegmentedControl
					fullWidth
					value={tab}
					onChange={value => setTab(value as TabValue)}
					data={TABS.map(({ value, label }) => ({ value, label }))}
				/>

				{/* Fixed so the modal keeps its height as tabs of different
				    lengths come and go. */}
				<ScrollArea h="clamp(220px, 45vh, 360px)" offsetScrollbars>
					<Stack gap="sm">
						<Text size="sm" c="dimmed">
							{description}
						</Text>
						{tab === "cards" && <CardsTab form={form} />}
						{tab === "learningAssets" && (
							<LearningAssetsAndExtractsTab form={form} />
						)}
						{tab === "queue" && <QueueTab form={form} />}
					</Stack>
				</ScrollArea>

				<Divider mt="auto" />

				<Group justify="space-between">
					<Group gap={4}>
						{profile && (
							<Button
								type="button"
								variant="default"
								size="sm"
								onClick={() => void handleClone()}>
								Clone
							</Button>
						)}
						{profile && !profile.isDefault && (
							<AppTooltip
								label="Makes this the default profile. Default status can only be moved to another profile, never simply turned off."
								multiline>
								<Button
									type="button"
									variant="default"
									size="sm"
									onClick={() => void handleSetDefault()}>
									Make default
								</Button>
							</AppTooltip>
						)}
						{profile && !profile.isDefault && (
							<Button
								type="button"
								variant="subtle"
								color="red"
								size="sm"
								onClick={handleDelete}>
								Delete
							</Button>
						)}
					</Group>
					<Button type="submit" size="sm">
						{profile ? "Save" : "Create"}
					</Button>
				</Group>
			</Stack>
		</form>
	);
}

export default ProfileForm;
