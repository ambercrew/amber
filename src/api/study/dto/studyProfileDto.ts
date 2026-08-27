import { ElementId } from "../../../types/elements/elementId";

export interface StudyProfileDto {
	id: string;
	createdAt: string;
	modifiedAt: string;
	name: string;
	isDefault: boolean;
	desiredRetention: number;
	fsrsParams: number[];
	learningSteps: string[];
	relearningSteps: string[];
	initialIntervalMultiplier: number;
	initialIntervalDays: number;
	minIntervalDays: number;
}

export interface StudyProfileRequestDto {
	name: string;
	desiredRetention: number;
	fsrsParams: number[];
	learningSteps: string[];
	relearningSteps: string[];
	initialIntervalMultiplier: number;
	initialIntervalDays: number;
	minIntervalDays: number;
}

export type ProfileSource = "direct" | "inherited" | "default";

export interface EffectiveProfileDto {
	profile: StudyProfileDto;
	source: ProfileSource;
	inheritedFrom: ElementId | null;
}
