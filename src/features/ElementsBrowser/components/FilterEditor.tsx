import { ElementFilter } from "../../../types/elements/elementFilter";
import { BibliographicalSourceResponseDto } from "../../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { StudyProfileDto } from "../../../api/study/dto/studyProfileDto";
import NameFilterEditor from "./editors/NameFilterEditor";
import TagsFilterEditor from "./editors/TagsFilterEditor";
import DateFilterEditor from "./editors/DateFilterEditor";
import BibliographicalSourceFilterEditor from "./editors/BibliographicalSourceFilterEditor";
import ElementTypeFilterEditor from "./editors/ElementTypeFilterEditor";
import PriorityFilterEditor from "./editors/PriorityFilterEditor";
import StudyProfileFilterEditor from "./editors/StudyProfileFilterEditor";

export default function FilterEditor({
	filter,
	sources,
	profiles,
	onChange,
}: {
	filter: ElementFilter;
	sources: BibliographicalSourceResponseDto[];
	profiles: StudyProfileDto[];
	onChange: (filter: ElementFilter) => void;
}) {
	switch (filter.field) {
		case "name":
			return <NameFilterEditor filter={filter} onChange={onChange} />;
		case "tags":
			return <TagsFilterEditor filter={filter} onChange={onChange} />;
		case "dueDate":
		case "createdDate":
			return <DateFilterEditor filter={filter} onChange={onChange} />;
		case "bibliographicalSource":
			return (
				<BibliographicalSourceFilterEditor
					filter={filter}
					sources={sources}
					onChange={onChange}
				/>
			);
		case "elementType":
			return (
				<ElementTypeFilterEditor filter={filter} onChange={onChange} />
			);
		case "priority":
			return <PriorityFilterEditor filter={filter} onChange={onChange} />;
		case "studyProfile":
			return (
				<StudyProfileFilterEditor
					filter={filter}
					profiles={profiles}
					onChange={onChange}
				/>
			);
	}
}
