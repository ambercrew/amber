export type BulkCallApi = (
	cb: () => Promise<void>,
) => Promise<void | undefined>;
