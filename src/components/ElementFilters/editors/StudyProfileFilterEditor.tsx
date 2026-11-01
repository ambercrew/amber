import { StudyProfileFilter } from "../../../api/savedSearches/dto/elementFilter";
import { StudyProfileDto } from "../../../api/study/dto/studyProfileDto";
import SelectFilterEditor from "./SelectFilterEditor";

export default function StudyProfileFilterEditor({
	filter,
	profiles,
	onChange,
}: {
	filter: StudyProfileFilter;
	profiles: StudyProfileDto[];
	onChange: (filter: StudyProfileFilter) => void;
}) {
	return (
		<SelectFilterEditor
			operator={filter.operator}
			values={filter.profileIds}
			data={profiles.map(profile => ({
				value: profile.id,
				label: profile.name,
			}))}
			placeholder="Select study profiles"
			searchable
			onChange={(operator, profileIds) =>
				onChange({ ...filter, operator, profileIds })
			}
		/>
	);
}
