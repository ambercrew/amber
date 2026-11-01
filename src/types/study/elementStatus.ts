/** Whether an element takes part in the review queue. Only learning assets and extracts can be finished. */
export type ElementStatus = "active" | "suspended" | "finished";

export const elementStatusOptions: { value: ElementStatus; label: string }[] = [
	{ value: "active", label: "Active" },
	{ value: "suspended", label: "Suspended" },
	{ value: "finished", label: "Finished" },
];
