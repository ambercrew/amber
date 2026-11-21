/** What placed the read point during this opening of a learning asset; `lookup` opens at a spot, where only a manual set moves it. */
export type ReadPointSource = "automatic" | "extract" | "lookup" | "manual";
