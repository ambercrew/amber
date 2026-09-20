import {
	Placement,
	PlacementType,
	StudyProfileDto,
	StudyProfileRequestDto,
} from "../../../../api/study/dto/studyProfileDto";

// Mirrors fsrs::DEFAULT_PARAMETERS (src-tauri) so a new profile starts with
// the same weights the backend would otherwise fall back to.
const DEFAULT_FSRS_PARAMS = [
	0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
	0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425,
	0.0912, 0.0658, 0.1542,
];

export const FSRS_PARAM_COUNT = 21;

export interface ProfileFormValues extends Omit<
	StudyProfileRequestDto,
	| "fsrsParams"
	| "learningSteps"
	| "relearningSteps"
	| "priorityInheritancePolicy"
> {
	fsrsParams: string;
	learningSteps: string;
	relearningSteps: string;
	placementType: PlacementType;
	// The percentile the chosen placement takes, ignored by the two that take none.
	placementPercentile: number;
	capPriority: boolean;
	ceilingPercentile: number;
}

export const PLACEMENT_OPTIONS: {
	value: PlacementType;
	label: string;
}[] = [
	{ value: "aboveParent", label: "Above parent" },
	{ value: "belowParent", label: "Below parent" },
	{ value: "offsetFromParent", label: "Offset from parent" },
	{ value: "fixedPercentile", label: "Fixed percentile" },
];

export const PLACEMENT_PERCENTILE_LABELS: Partial<
	Record<PlacementType, string>
> = {
	offsetFromParent: "Offset (percentile points)",
	fixedPercentile: "Percentile",
};

export const PLACEMENT_TOOLTIP =
	"Where a new element lands in the priority queue, relative to the element it was extracted from (or its parent). Percentiles run from 0% (front of the queue) to 100% (back).";

export const CEILING_TOOLTIP =
	"The new element never lands ahead of this percentile, however high its parent sits: with a cap at 20%, a parent at 3% still yields 20%.";

function placementPercentileOf(placement: Placement | undefined): number {
	switch (placement?.type) {
		case "offsetFromParent":
			return placement.offsetPercentile;
		case "fixedPercentile":
			return placement.percentile;
		case "aboveParent":
		case "belowParent":
		case undefined:
			return 0;
	}
}

function toPlacement(type: PlacementType, percentile: number): Placement {
	switch (type) {
		case "offsetFromParent":
			return { type, offsetPercentile: percentile };
		case "fixedPercentile":
			return { type, percentile };
		case "aboveParent":
		case "belowParent":
			return { type };
	}
}

export function parseFsrsParams(raw: string): number[] {
	return raw
		.split(",")
		.map(part => part.trim())
		.filter(part => part.length > 0)
		.map(Number);
}

export function isValidFsrsParams(raw: string): boolean {
	const parts = parseFsrsParams(raw);
	return (
		parts.length === FSRS_PARAM_COUNT &&
		parts.every(value => !Number.isNaN(value))
	);
}

// Matches ts-fsrs's StepUnit: a positive number followed by a time unit
// (minutes, hours or days), e.g. "1m", "10m", "1d".
const STEP_UNIT_PATTERN = /^\d+(\.\d+)?[mhd]$/;

export function parseSteps(raw: string): string[] {
	return raw.split(/\s+/).filter(step => step.length > 0);
}

export function isValidSteps(raw: string): boolean {
	return parseSteps(raw).every(step => STEP_UNIT_PATTERN.test(step));
}

export function initialValues(
	profile: StudyProfileDto | null,
): ProfileFormValues {
	return {
		name: profile?.name ?? "New profile",
		desiredRetention: profile?.desiredRetention ?? 0.9,
		fsrsParams: (profile?.fsrsParams ?? DEFAULT_FSRS_PARAMS).join(", "),
		learningSteps: (profile?.learningSteps ?? []).join(" "),
		relearningSteps: (profile?.relearningSteps ?? []).join(" "),
		initialIntervalMultiplier: profile?.initialIntervalMultiplier ?? 1.2,
		initialIntervalDays: profile?.initialIntervalDays ?? 1,
		minIntervalDays: profile?.minIntervalDays ?? 1,
		placementType:
			profile?.priorityInheritancePolicy.placement.type ?? "aboveParent",
		placementPercentile: placementPercentileOf(
			profile?.priorityInheritancePolicy.placement,
		),
		capPriority:
			profile?.priorityInheritancePolicy.ceilingPercentile != null,
		ceilingPercentile:
			profile?.priorityInheritancePolicy.ceilingPercentile ?? 20,
	};
}

/** Drops the form-only fields, so only what the backend declares is sent. */
export function toRequestDto(
	values: ProfileFormValues,
): StudyProfileRequestDto {
	const {
		placementType,
		placementPercentile,
		capPriority,
		ceilingPercentile,
		...rest
	} = values;
	return {
		...rest,
		fsrsParams: parseFsrsParams(values.fsrsParams),
		learningSteps: parseSteps(values.learningSteps),
		relearningSteps: parseSteps(values.relearningSteps),
		priorityInheritancePolicy: {
			placement: toPlacement(placementType, placementPercentile),
			ceilingPercentile:
				capPriority && placementType !== "fixedPercentile"
					? ceilingPercentile
					: null,
		},
	};
}
