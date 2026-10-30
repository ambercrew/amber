import {
	DateFilter,
	DescendantFilterOperator,
	ElementFilter,
	SelectFilterOperator,
} from "../../../api/savedSearches/dto/elementFilter";
import { ElementNameState } from "../../../hooks/useElementName";
import { BibliographicalSourceResponseDto } from "../../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { StudyProfileDto } from "../../../api/study/dto/studyProfileDto";
import { elementTypeOptions } from "../../../utils/elementTypeOptions";
import { elementStatusOptions } from "../../../types/study/elementStatus";
import { formatPriorityPercentileRange } from "../../../utils/formatPriorityPercentile";

export interface FilterDisplay {
	/** Replaces the field's label on the chip when the operator reads better folded into it. */
	fieldLabel?: string;
	operatorLabel: string;
	valueLabel: string;
}

export const selectOperatorLabels: Record<SelectFilterOperator, string> = {
	isAnyOf: "is any of",
	isNoneOf: "is none of",
};

export const descendantOperatorLabels: Record<
	DescendantFilterOperator,
	string
> = {
	is: "Descendant of",
	isNot: "Not descendant of",
	isOrSelf: "Is or descendant of",
};

function describeAncestor(
	hasAncestor: boolean,
	{ name, errorMessage }: ElementNameState,
): string {
	if (!hasAncestor) return "not set";
	if (errorMessage) return "failed to load";
	return name ?? "…";
}

function formatDate(iso: string | null): string {
	if (!iso) {
		return "…";
	}
	return new Date(iso).toLocaleDateString();
}

function joinNames(names: string[]): string {
	if (names.length === 0) {
		return "…";
	}
	return names.join(", ");
}

function describeDate(filter: DateFilter): FilterDisplay {
	if (filter.operator === "today") {
		return { operatorLabel: "today", valueLabel: "" };
	}
	if (filter.operator === "withinDays") {
		return { operatorLabel: "within", valueLabel: `${filter.days ?? 0}d` };
	}
	if (filter.operator === "before" || filter.operator === "after") {
		return {
			operatorLabel: filter.operator,
			valueLabel: formatDate(filter.from),
		};
	}
	return {
		operatorLabel: "between",
		valueLabel: `${formatDate(filter.from)} – ${formatDate(filter.to)}`,
	};
}

export function describeFilter(
	filter: ElementFilter,
	sources: BibliographicalSourceResponseDto[],
	profiles: StudyProfileDto[],
	ancestor: ElementNameState = {
		name: null,
		errorMessage: null,
	},
): FilterDisplay {
	switch (filter.field) {
		case "name": {
			const operatorLabel =
				filter.operator === "contains"
					? "contains"
					: filter.operator === "equals"
						? "equals"
						: filter.operator === "startsWith"
							? "starts with"
							: "ends with";
			return { operatorLabel, valueLabel: filter.value || "…" };
		}
		case "tags": {
			const operatorLabel =
				filter.operator === "isAnyOf"
					? "is any of"
					: filter.operator === "isAllOf"
						? "is all of"
						: "is none of";
			return { operatorLabel, valueLabel: joinNames(filter.tags) };
		}
		case "dueDate":
		case "createdDate":
			return describeDate(filter);
		case "bibliographicalSource": {
			const names = sources
				.filter(source => filter.sourceIds.includes(source.id))
				.map(source => source.title);
			return {
				operatorLabel: selectOperatorLabels[filter.operator],
				valueLabel: joinNames(names),
			};
		}
		case "studyProfile": {
			const names = profiles
				.filter(profile => filter.profileIds.includes(profile.id))
				.map(profile => profile.name);
			return {
				operatorLabel: selectOperatorLabels[filter.operator],
				valueLabel: joinNames(names),
			};
		}
		case "elementType": {
			const names = elementTypeOptions
				.filter(option => filter.types.includes(option.value))
				.map(option => option.label);
			return {
				operatorLabel: selectOperatorLabels[filter.operator],
				valueLabel: joinNames(names),
			};
		}
		case "descendantOf":
			return {
				fieldLabel: descendantOperatorLabels[filter.operator],
				operatorLabel: "",
				valueLabel: describeAncestor(
					filter.ancestor !== null,
					ancestor,
				),
			};
		case "status": {
			const names = elementStatusOptions
				.filter(option => filter.statuses.includes(option.value))
				.map(option => option.label);
			return {
				operatorLabel: selectOperatorLabels[filter.operator],
				valueLabel: joinNames(names),
			};
		}
		case "priority":
			return {
				operatorLabel: "",
				valueLabel: formatPriorityPercentileRange(
					filter.min,
					filter.max,
				),
			};
	}
}

/** A filter as one line of plain text, e.g. "Name contains Rust". */
export function formatFilter(
	filter: ElementFilter,
	fieldLabel: string,
	sources: BibliographicalSourceResponseDto[],
	profiles: StudyProfileDto[],
	ancestor?: ElementNameState,
): string {
	const display = describeFilter(filter, sources, profiles, ancestor);
	return [
		display.fieldLabel ?? fieldLabel,
		display.operatorLabel,
		display.valueLabel,
	]
		.filter(Boolean)
		.join(" ");
}
