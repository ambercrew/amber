import { ElementId } from "./elementId";
import { Origin } from "./origin";

export interface CreateMetaDto {
	name: string | null;
	parent: ElementId | null;
	origin: Origin;
}
