import {
	BookOpenIcon,
	CalendarIcon,
	CardsIcon,
	ClockCounterClockwiseIcon,
	FileTextIcon,
	FolderIcon,
	FolderOpenIcon,
	GraduationCapIcon,
	HouseIcon,
	ListMagnifyingGlassIcon,
	ScissorsIcon,
	StackIcon,
	TagIcon,
	TextAaIcon,
	TreeViewIcon,
	TrendUpIcon,
} from "@phosphor-icons/react";

/** The app's icon vocabulary. A concept is named once here so it looks the
 * same in the sidebar, in page headings and anywhere else it appears. */
export const HomeIcon = HouseIcon;
export const BrowserIcon = ListMagnifyingGlassIcon;

export const FolderElementIcon = FolderIcon;
export const FolderOpenElementIcon = FolderOpenIcon;
export const LearningAssetElementIcon = FileTextIcon;
export const ExtractElementIcon = ScissorsIcon;
export const CardElementIcon = CardsIcon;

// Element properties, e.g. the fields a search can be filtered by.
export const NamePropertyIcon = TextAaIcon;
export const TagsPropertyIcon = TagIcon;
export const CreatedPropertyIcon = ClockCounterClockwiseIcon;
export const ElementTypePropertyIcon = StackIcon;
export const DescendantOfPropertyIcon = TreeViewIcon;
export const StudyProfilePropertyIcon = GraduationCapIcon;
export const DuePropertyIcon = CalendarIcon;
export const PriorityPropertyIcon = TrendUpIcon;
export const BibliographicalSourcePropertyIcon = BookOpenIcon;
