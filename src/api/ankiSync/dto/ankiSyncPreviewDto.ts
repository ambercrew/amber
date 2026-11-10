export interface AnkiDeckPreviewDto {
	name: string;
	newCards: number;
	import: boolean | null;
}

export interface AnkiSendingDeckDto {
	name: string;
	newCards: number;
}

export interface AnkiSyncPreviewDto {
	profile: string;
	isFirstSync: boolean;
	decks: AnkiDeckPreviewDto[];
	/** Amber's cards going to Anki for the first time, by the deck they land in. */
	sendingDecks: AnkiSendingDeckDto[];
	/** Cards Anki already has that Amber's changes will update. */
	cardsToUpdate: number;
	/** Amber's cards whose edit in Anki comes back to Amber. */
	cardsEditedInAnki: number;
	/** Amber's reviews Anki lacks, of the cards the sync pairs. */
	reviewsToAnki: number;
	/** Anki's reviews Amber lacks, leaving out cards a deck import brings. */
	reviewsToAmber: number;
	/** Due dates moved in Amber without a review, which Anki takes. */
	dueDatesToAnki: number;
	/** Due dates moved in Anki without a review, which Amber takes. */
	dueDatesToAmber: number;
	notesToDelete: number;
	cardsToTrash: number;
}

export interface AnkiDeckChoiceDto {
	deck: string;
	import: boolean;
}
