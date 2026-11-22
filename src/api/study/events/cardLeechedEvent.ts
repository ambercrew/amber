export const CARD_LEECHED_EVENT = "cardLeeched";

export interface CardLeechedEventDto {
	cardId: string;
	lapses: number;
	suspended: boolean;
	/** False for an image occlusion card, whose sides an AI text rewrite would replace. */
	rewritable: boolean;
}
