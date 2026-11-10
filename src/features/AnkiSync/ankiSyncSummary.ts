import { AnkiSyncResponseDto } from "../../api/ankiSync/dto/ankiSyncResponseDto";

function count(value: number, noun: string): string {
	return `${value} ${noun}${value === 1 ? "" : "s"}`;
}

/** Only what changed, or that nothing did. */
export function describeAnkiSync(summary: AnkiSyncResponseDto): string {
	const changes = [
		summary.importedCards > 0 &&
			`${count(summary.importedCards, "card")} imported`,
		summary.sentCards > 0 &&
			`${count(summary.sentCards, "new card")} sent to Anki`,
		summary.editedCards.length > 0 &&
			`${count(summary.editedCards.length, "card")} updated from Anki`,
		summary.sentEdits > 0 &&
			`${count(summary.sentEdits, "card")} updated in Anki`,
		summary.pulledReviews > 0 &&
			`${count(summary.pulledReviews, "review")} from Anki`,
		summary.pushedReviews > 0 &&
			`${count(summary.pushedReviews, "review")} sent to Anki`,
		summary.dueDatesToAmber > 0 &&
			`${count(summary.dueDatesToAmber, "due date")} from Anki`,
		summary.dueDatesToAnki > 0 &&
			`${count(summary.dueDatesToAnki, "due date")} sent to Anki`,
		summary.trashedCards > 0 &&
			`${count(summary.trashedCards, "card")} moved to the trash`,
		summary.deletedNotes > 0 &&
			`${count(summary.deletedNotes, "note")} deleted from Anki`,
	].filter(change => change !== false);
	return changes.length > 0
		? `Anki sync finished: ${changes.join(", ")}.`
		: "Already up to date with Anki.";
}
