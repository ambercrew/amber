import { ElementId } from "../../../types/elements/elementId";
import { Tag } from "../../../types/elements/tag";
import { PriorityInfoDto } from "../../elements/dto/priorityInfoDto";

export type SearchElementResultDto = ElementId & {
	name: string;
	priority: PriorityInfoDto;
	due: string | null;
	tags: Tag[];
};
