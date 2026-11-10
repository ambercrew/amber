export const ANKI_SYNC_PROGRESS_EVENT = "ankiSyncProgress";

export type AnkiSyncStage = "deleting" | "importing" | "sending" | "reviews";

export interface AnkiSyncProgressEventDto {
	stage: AnkiSyncStage;
	current: number;
	total: number;
}
