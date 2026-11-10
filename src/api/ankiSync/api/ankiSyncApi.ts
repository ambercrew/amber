import { invoke } from "@tauri-apps/api/core";
import {
	AnkiDeckChoiceDto,
	AnkiSyncPreviewDto,
} from "../dto/ankiSyncPreviewDto";
import { AnkiSyncResponseDto } from "../dto/ankiSyncResponseDto";
import { AnkiSyncStatusDto } from "../dto/ankiSyncStatusDto";

export function getAnkiSyncStatus(): Promise<AnkiSyncStatusDto> {
	return invoke("get_anki_sync_status");
}

export function previewAnkiSync(): Promise<AnkiSyncPreviewDto> {
	return invoke("preview_anki_sync");
}

export function syncAnki(
	deckChoices: AnkiDeckChoiceDto[],
): Promise<AnkiSyncResponseDto> {
	return invoke("sync_anki", { deckChoices });
}

export function cancelAnkiSync(): Promise<void> {
	return invoke("cancel_anki_sync");
}

/** Whether the card came from Anki and the sync replaces its content when the note changes there. */
export function isCardSyncedFromAnki(cardId: string): Promise<boolean> {
	return invoke("is_card_synced_from_anki", { cardId });
}
