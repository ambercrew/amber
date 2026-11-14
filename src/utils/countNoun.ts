/** "1 card", "3 cards". */
export function countNoun(value: number, noun: string): string {
	return `${value} ${noun}${value === 1 ? "" : "s"}`;
}
