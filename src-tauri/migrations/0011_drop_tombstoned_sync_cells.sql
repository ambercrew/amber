-- Deletes now drop a row's other cells when writing its tombstone, so a deleted
-- element stops keeping a copy of its payload (a whole PDF, for
-- `learning_asset_pdfs.bytes`). This drops the copies left by earlier deletes;
-- cells newer than the tombstone are kept since they resurrect the row.
DELETE FROM sync_cells
WHERE col <> '__deleted'
  AND EXISTS (
      SELECT 1 FROM sync_cells AS tombstone
      WHERE tombstone.tbl = sync_cells.tbl
        AND tombstone.row_id = sync_cells.row_id
        AND tombstone.col = '__deleted'
        AND tombstone.hlc > sync_cells.hlc
  );
