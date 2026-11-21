import { lazy } from "react";

// The canvas library is large, so the editor loads when first opened rather than at startup.
const LazyResponsiveOcclusionEditor = lazy(
	() => import("./ResponsiveOcclusionEditor"),
);

export default LazyResponsiveOcclusionEditor;
