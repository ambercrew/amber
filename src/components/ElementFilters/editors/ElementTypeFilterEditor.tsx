import { ElementTypeFilter } from "../../../api/savedSearches/dto/elementFilter";
import { elementTypeOptions } from "../../../utils/elementTypeOptions";
import SelectFilterEditor from "./SelectFilterEditor";

export default function ElementTypeFilterEditor({
	filter,
	onChange,
}: {
	filter: ElementTypeFilter;
	onChange: (filter: ElementTypeFilter) => void;
}) {
	return (
		<SelectFilterEditor
			operator={filter.operator}
			values={filter.types}
			data={elementTypeOptions}
			placeholder="Select element types"
			onChange={(operator, types) =>
				onChange({ ...filter, operator, types })
			}
		/>
	);
}
