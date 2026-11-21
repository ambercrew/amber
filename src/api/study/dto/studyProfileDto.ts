import { ElementId } from "../../../types/elements/elementId";

export type Placement =
	| { type: "aboveParent" }
	| { type: "belowParent" }
	| { type: "offsetFromParent"; offsetPercentile: number }
	| { type: "fixedPercentile"; percentile: number };

export type PlacementType = Placement["type"];

export interface PriorityInheritancePolicy {
	placement: Placement;
	ceilingPercentile: number | null;
}

/** What happens to a card on becoming a leech; it's tagged `leech` either way. */
export type LeechAction = "tagOnly" | "suspend";

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
	maximumIntervalDays: number;
	newCardsPerDay: number;
	leechThreshold: number;
	leechAction: LeechAction;
	cardInitialIntervalDays: number;
	buryNewSiblings: boolean;
	buryReviewSiblings: boolean;
	initialIntervalMultiplier: number;
	initialIntervalDays: number;
	minIntervalDays: number;
	priorityInheritancePolicy: PriorityInheritancePolicy;
}

export interface StudyProfileRequestDto {
	name: string;
	desiredRetention: number;
	fsrsParams: number[];
	learningSteps: string[];
	relearningSteps: string[];
	maximumIntervalDays: number;
	newCardsPerDay: number;
	leechThreshold: number;
	leechAction: LeechAction;
	cardInitialIntervalDays: number;
	buryNewSiblings: boolean;
	buryReviewSiblings: boolean;
	initialIntervalMultiplier: number;
	initialIntervalDays: number;
	minIntervalDays: number;
	priorityInheritancePolicy: PriorityInheritancePolicy;
}

export type ProfileSource = "direct" | "inherited" | "default";

export interface EffectiveProfileDto {
	profile: StudyProfileDto;
	source: ProfileSource;
	inheritedFrom: ElementId | null;
}

export interface OptimizedFsrsParamsDto {
	fsrsParams: number[];
	reviewCount: number;
}
