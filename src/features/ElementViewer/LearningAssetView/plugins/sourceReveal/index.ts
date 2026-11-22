import { LearningAssetPlugin } from "../types";
import SourceRevealProvider from "./SourceRevealProvider";

/** Opens at the highlight a navigation asks for (`SpotNavigationState`), e.g. the Origin panel's "Derived from" link. */
export const sourceRevealPlugin: LearningAssetPlugin = {
	id: "sourceReveal",
	Provider: SourceRevealProvider,
};
