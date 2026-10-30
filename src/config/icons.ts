import {
	ArrowRightIcon,
	BookmarkSimpleIcon,
	BookOpenIcon,
	BooksIcon,
	BoundingBoxIcon,
	CalendarIcon,
	CardsIcon,
	ChatCircleTextIcon,
	CheckSquareIcon,
	CircleHalfIcon,
	ClockCounterClockwiseIcon,
	FileTextIcon,
	FolderIcon,
	FolderOpenIcon,
	GitForkIcon,
	GraduationCapIcon,
	HouseIcon,
	Icon,
	ListMagnifyingGlassIcon,
	MagicWandIcon,
	NotePencilIcon,
	PaperclipIcon,
	PauseIcon,
	PlayIcon,
	ScissorsIcon,
	SparkleIcon,
	StackIcon,
	TagIcon,
	TextAaIcon,
	TextboxIcon,
	TreeViewIcon,
	TrendUpIcon,
} from "@phosphor-icons/react";
import { ElementStatus } from "../types/study/elementStatus";

/** The app's icon vocabulary. A concept is named once here so it looks the
 * same in the sidebar, in page headings and anywhere else it appears. */
export const HomeIcon = HouseIcon;
export const BrowserIcon = ListMagnifyingGlassIcon;

export const FolderElementIcon = FolderIcon;
export const FolderOpenElementIcon = FolderOpenIcon;
export const LearningAssetElementIcon = FileTextIcon;
export const ExtractElementIcon = ScissorsIcon;
export const CardElementIcon = CardsIcon;
export const ImageOcclusionIcon = BoundingBoxIcon;

// Element properties, e.g. the fields a search can be filtered by.
export const NamePropertyIcon = TextAaIcon;
export const TagsPropertyIcon = TagIcon;
export const CreatedPropertyIcon = ClockCounterClockwiseIcon;
export const ElementTypePropertyIcon = StackIcon;
export const DescendantOfPropertyIcon = TreeViewIcon;
export const StudyProfilePropertyIcon = GraduationCapIcon;
export const DuePropertyIcon = CalendarIcon;
export const PriorityPropertyIcon = TrendUpIcon;
export const StatusPropertyIcon = CircleHalfIcon;
export const BibliographicalSourcePropertyIcon = BookOpenIcon;

/** Each status an element can be set to, wherever it's offered as a choice. */
export const ELEMENT_STATUS_ICONS: Record<ElementStatus, Icon> = {
	active: PlayIcon,
	suspended: PauseIcon,
	finished: CheckSquareIcon,
};

// Read point and marks in a learning asset's reading view.
export const ReadPointIcon = BookmarkSimpleIcon;
export const SetMarkIcon = BookmarkSimpleIcon;
export const GoToMarkIcon = ArrowRightIcon;

// AI
/** The AI itself: its panel, its settings and what's handed to it. */
export const AiIcon = SparkleIcon;
export const AskAiIcon = ChatCircleTextIcon;
export const AiCardsIcon = MagicWandIcon;
export const AiDocumentIcon = PaperclipIcon;
export const AiPromptLibraryIcon = BooksIcon;
export const NewAiPromptIcon = NotePencilIcon;
export const BranchAiChatIcon = GitForkIcon;

/** What each AI tool call shows in the chat, keyed by the tool's name. */
export const AI_TOOL_ICONS: Record<string, Icon> = {
	search_documents: AiDocumentIcon,
	create_card: CardElementIcon,
	create_cloze_card: TextboxIcon,
	finish_extract: ELEMENT_STATUS_ICONS.finished,
};
