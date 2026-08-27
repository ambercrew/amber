import {
	Button,
	Group,
	NumberInput,
	Stack,
	TagsInput,
	Text,
	Textarea,
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
} from "../../../api/study/api/studyProfileApi";
import {
	StudyProfileDto,
	StudyProfileRequestDto,
} from "../../../api/study/dto/studyProfileDto";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import FieldLabel from "../../../components/FieldLabel/FieldLabel";

interface ProfileFormProps {
	profile: StudyProfileDto | null;
	onSaved: (selectId?: string) => void;
	onSubmitted: () => void;
}

// Mirrors fsrs::DEFAULT_PARAMETERS (src-tauri) so a new profile starts with
// the same weights the backend would otherwise fall back to.
const DEFAULT_FSRS_PARAMS = [
	0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
	0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425,
	0.0912, 0.0658, 0.1542,
];

interface ProfileFormValues extends Omit<StudyProfileRequestDto, "fsrsParams"> {
	fsrsParams: string;
}

function parseFsrsParams(raw: string): number[] {
	return raw
		.split(",")
		.map(part => part.trim())
		.filter(part => part.length > 0)
		.map(Number);
}

const FSRS_PARAM_COUNT = 21;

function isValidFsrsParams(raw: string): boolean {
	const parts = parseFsrsParams(raw);
	return (
		parts.length === FSRS_PARAM_COUNT &&
		parts.every(value => !Number.isNaN(value))
	);
}

// Matches ts-fsrs's StepUnit: a positive number followed by a time unit
// (minutes, hours or days), e.g. "1m", "10m", "1d".
const STEP_UNIT_PATTERN = /^\d+(\.\d+)?[mhd]$/;

function isValidSteps(steps: string[]): boolean {
	return steps.every(step => STEP_UNIT_PATTERN.test(step));
}

function ProfileForm({ profile, onSaved, onSubmitted }: ProfileFormProps) {
	const form = useForm<ProfileFormValues>({
		initialValues: {
			name: profile?.name ?? "New profile",
			desiredRetention: profile?.desiredRetention ?? 0.9,
			fsrsParams: (profile?.fsrsParams ?? DEFAULT_FSRS_PARAMS).join(", "),
			learningSteps: profile?.learningSteps ?? [],
			relearningSteps: profile?.relearningSteps ?? [],
			initialIntervalMultiplier:
				profile?.initialIntervalMultiplier ?? 1.2,
			initialIntervalDays: profile?.initialIntervalDays ?? 1,
			minIntervalDays: profile?.minIntervalDays ?? 1,
		},
		validate: {
			fsrsParams: value =>
				isValidFsrsParams(value)
					? null
					: `Enter exactly ${FSRS_PARAM_COUNT} comma-separated numbers`,
			learningSteps: value =>
				isValidSteps(value)
					? null
					: "Each step must be a number followed by m, h or d (e.g. 1m, 10m, 1d)",
			relearningSteps: value =>
				isValidSteps(value)
					? null
					: "Each step must be a number followed by m, h or d (e.g. 1m, 10m, 1d)",
		},
	});

	async function handleSubmit(values: ProfileFormValues) {
		const payload: StudyProfileRequestDto = {
			...values,
			fsrsParams: parseFsrsParams(values.fsrsParams),
		};
		if (profile) {
			await updateStudyProfile(profile.id, payload);
		} else {
			await createStudyProfile(payload);
		}
		onSaved();
		onSubmitted();
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
		<form onSubmit={form.onSubmit(values => void handleSubmit(values))}>
			<Stack gap="sm">
				<TextInput
					label={
						<FieldLabel
							label="Name"
							tooltip="A label to identify this profile."
						/>
					}
					{...form.getInputProps("name")}
				/>
				<NumberInput
					label={
						<FieldLabel
							label="Desired retention"
							tooltip="The probability of recall FSRS aims for when scheduling cards. Higher retention means more frequent reviews."
						/>
					}
					min={0.7}
					max={0.99}
					step={0.01}
					decimalScale={2}
					{...form.getInputProps("desiredRetention")}
				/>
				<Textarea
					label={
						<FieldLabel
							label="FSRS weights"
							tooltip="Advanced: the FSRS model weights used to schedule cards. Leave as-is unless you know what you're doing."
						/>
					}
					autosize
					minRows={2}
					{...form.getInputProps("fsrsParams")}
				/>
				<TagsInput
					label={
						<FieldLabel
							label="Learning steps"
							tooltip="Same-day intervals a new card repeats before entering the long-term review schedule (e.g. 1m, 10m). Leave empty to use the default steps."
						/>
					}
					placeholder={
						form.values.learningSteps.length === 0
							? "1m, 10m"
							: undefined
					}
					{...form.getInputProps("learningSteps")}
				/>
				<TagsInput
					label={
						<FieldLabel
							label="Relearning steps"
							tooltip="Same-day intervals a card repeats after being rated Again before returning to the long-term review schedule (e.g. 10m). Leave empty to use the default steps."
						/>
					}
					placeholder={
						form.values.relearningSteps.length === 0
							? "10m"
							: undefined
					}
					{...form.getInputProps("relearningSteps")}
				/>
				<NumberInput
					label={
						<FieldLabel
							label="Initial interval multiplier"
							tooltip="Starting multiplier applied to the interval each time an incremental learning asset or extract is revisited. Copied onto each learning asset/extract when it's created; editing this afterwards only affects newly created ones."
						/>
					}
					min={0}
					step={0.1}
					decimalScale={2}
					{...form.getInputProps("initialIntervalMultiplier")}
				/>
				<NumberInput
					label={
						<FieldLabel
							label="Initial interval (days)"
							tooltip="Days until the first due date for learning assets, extracts and cards created under this profile."
						/>
					}
					min={0}
					step={1}
					{...form.getInputProps("initialIntervalDays")}
				/>
				<NumberInput
					label={
						<FieldLabel
							label="Min interval (days)"
							tooltip="Floor applied to computed intervals, so incremental learning asset items are never scheduled sooner than this."
						/>
					}
					min={0}
					step={1}
					{...form.getInputProps("minIntervalDays")}
				/>

				<Group justify="space-between" mt="sm">
					<Group gap={4}>
						{profile && (
							<Button
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
									variant="default"
									size="sm"
									onClick={() => void handleSetDefault()}>
									Make default
								</Button>
							</AppTooltip>
						)}
						{profile && !profile.isDefault && (
							<Button
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
