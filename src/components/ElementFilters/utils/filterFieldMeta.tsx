import {
	BibliographicalSourcePropertyIcon,
	CreatedPropertyIcon,
	DescendantOfPropertyIcon,
	DuePropertyIcon,
	ElementTypePropertyIcon,
	NamePropertyIcon,
	PriorityPropertyIcon,
	StudyProfilePropertyIcon,
	TagsPropertyIcon,
} from "../../../config/icons";
import { ElementFilterField } from "../../../api/savedSearches/dto/elementFilter";

export interface FilterFieldMeta {
	field: ElementFilterField;
	label: string;
	icon: (size: number) => React.ReactNode;
}

export interface FilterFieldGroup {
	label: string;
	fields: FilterFieldMeta[];
}

/** Grouped and ordered like the element details aside (Details, Study, Origin).
 * Descendant of isn't in the aside; it's under Origin since an element's ancestors are where it came from. */
export const filterFieldGroups: FilterFieldGroup[] = [
	{
		label: "Details",
		fields: [
			{
				field: "name",
				label: "Name",
				icon: size => <NamePropertyIcon size={size} />,
			},
			{
				field: "tags",
				label: "Tags",
				icon: size => <TagsPropertyIcon size={size} />,
			},
			{
				field: "createdDate",
				label: "Created",
				icon: size => <CreatedPropertyIcon size={size} />,
			},
			{
				field: "elementType",
				label: "Element type",
				icon: size => <ElementTypePropertyIcon size={size} />,
			},
		],
	},
	{
		label: "Study",
		fields: [
			{
				field: "studyProfile",
				label: "Study profile",
				icon: size => <StudyProfilePropertyIcon size={size} />,
			},
			{
				field: "dueDate",
				label: "Due",
				icon: size => <DuePropertyIcon size={size} />,
			},
			{
				field: "priority",
				label: "Priority",
				icon: size => <PriorityPropertyIcon size={size} />,
			},
		],
	},
	{
		label: "Origin",
		fields: [
			{
				field: "bibliographicalSource",
				label: "Bibliographical source",
				icon: size => <BibliographicalSourcePropertyIcon size={size} />,
			},
			{
				field: "descendantOf",
				label: "Descendant of",
				icon: size => <DescendantOfPropertyIcon size={size} />,
			},
		],
	},
];

export const filterFieldMetas: FilterFieldMeta[] = filterFieldGroups.flatMap(
	group => group.fields,
);

export function getFilterFieldMeta(field: ElementFilterField): FilterFieldMeta {
	const meta = filterFieldMetas.find(m => m.field === field);
	if (!meta) {
		throw new Error(`Unknown filter field: ${field}`);
	}
	return meta;
}
