export interface SyncResponseDto {
	/** The first primary key value (an element's id for its rows) of each row the sync changed, or `null` when too many changed to list. */
	changedKeys: string[] | null;
}
