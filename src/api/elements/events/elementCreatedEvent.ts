import { MetaNodeDto } from "../dto/nodeDto";

export const ELEMENT_CREATED_EVENT = "elementCreated";

export interface ElementCreatedEventDto {
	parentId: string | null;
	element: MetaNodeDto;
}
