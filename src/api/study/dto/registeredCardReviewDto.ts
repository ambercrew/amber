import { CardReviewDto } from "./cardReviewDto";

/** A stored grade, and whether it made the card a leech and suspended it. */
export interface RegisteredCardReviewDto {
	review: CardReviewDto;
	leeched: boolean;
	suspended: boolean;
}
