export interface AnkiSyncResponseDto {
	cards: number;
	importedCards: number;
	/** Amber's cards sent to Anki for the first time. */
	sentCards: number;
	pulledReviews: number;
	pushedReviews: number;
	trashedCards: number;
	deletedNotes: number;
	editedCards: string[];
	/** Notes Anki already held that Amber's changes updated. */
	sentEdits: number;
	/** Due dates moved in Amber without a review, carried over to Anki. */
	dueDatesToAnki: number;
	/** Due dates moved in Anki without a review, carried over to Amber. */
	dueDatesToAmber: number;
}
