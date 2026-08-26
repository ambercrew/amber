import { CardReviewDto } from "./cardReviewDto";
import { StudyProfileDto } from "./studyProfileDto";

/** Everything needed to schedule a card with ts-fsrs. */
export interface CardSchedulingDto {
	review: CardReviewDto;
	profile: StudyProfileDto;
}
