import { ElementFilter } from "../../savedSearches/dto/elementFilter";

export type StudyScopeDto =
	| { type: "savedSearch"; savedSearchId: string }
	| { type: "custom"; filters: ElementFilter[] };
