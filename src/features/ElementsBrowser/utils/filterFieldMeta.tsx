import {
	BookOpenIcon,
	CalendarIcon,
	ClockCounterClockwiseIcon,
	StackIcon,
	TagIcon,
	TextAaIcon,
	TrendUpIcon,
	GraduationCapIcon,
} from "@phosphor-icons/react";
import { ElementFilterField } from "../../../types/elements/elementFilter";

export interface FilterFieldMeta {
	field: ElementFilterField;
	label: string;
	icon: (size: number) => React.ReactNode;
}

export const filterFieldMetas: FilterFieldMeta[] = [
	{ field: "name", label: "Name", icon: size => <TextAaIcon size={size} /> },
	{ field: "tags", label: "Tags", icon: size => <TagIcon size={size} /> },
	{
		field: "dueDate",
		label: "Due date",
		icon: size => <CalendarIcon size={size} />,
	},
	{
		field: "bibliographicalSource",
		label: "Bibliographical source",
		icon: size => <BookOpenIcon size={size} />,
	},
	{
		field: "elementType",
		label: "Element type",
		icon: size => <StackIcon size={size} />,
	},
	{
		field: "createdDate",
		label: "Created",
		icon: size => <ClockCounterClockwiseIcon size={size} />,
	},
	{
		field: "priority",
		label: "Priority",
		icon: size => <TrendUpIcon size={size} />,
	},
	{
		field: "studyProfile",
		label: "Study profile",
		icon: size => <GraduationCapIcon size={size} />,
	},
];

export function getFilterFieldMeta(field: ElementFilterField): FilterFieldMeta {
	const meta = filterFieldMetas.find(m => m.field === field);
	if (!meta) {
		throw new Error(`Unknown filter field: ${field}`);
	}
	return meta;
}
