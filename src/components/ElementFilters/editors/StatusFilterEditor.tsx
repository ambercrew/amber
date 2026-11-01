import { StatusFilter } from "../../../api/savedSearches/dto/elementFilter";
import { elementStatusOptions } from "../../../types/study/elementStatus";
import SelectFilterEditor from "./SelectFilterEditor";

export default function StatusFilterEditor({
	filter,
	onChange,
}: {
	filter: StatusFilter;
	onChange: (filter: StatusFilter) => void;
}) {
	return (
		<SelectFilterEditor
			operator={filter.operator}
			values={filter.statuses}
			data={elementStatusOptions}
			placeholder="Select statuses"
			onChange={(operator, statuses) =>
				onChange({ ...filter, operator, statuses })
			}
		/>
	);
}
