import { ElementId } from "../../../types/elements/elementId";

export interface PriorityNeighborDto {
	elementId: ElementId;
	name: string;
}

export interface PriorityNeighborsResponseDto {
	before: PriorityNeighborDto | null;
	after: PriorityNeighborDto | null;
}
