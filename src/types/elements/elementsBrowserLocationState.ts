import { ElementFilter } from "./elementFilter";

export interface ElementsBrowserState {
	search: string;
	filters: ElementFilter[];
}

export interface ElementsBrowserLocationState {
	elementsBrowser?: ElementsBrowserState;
}
