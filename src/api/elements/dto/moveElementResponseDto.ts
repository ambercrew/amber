import { ElementId } from "../../../types/elements/elementId";

export interface MoveElementResponseDto {
	parent: ElementId | null;
	position: string;
	rebalanced: boolean;
}
