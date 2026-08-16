use crate::sync::errors::SyncError;
use crate::sync::hlc::Hlc;
use crate::sync::value_objects::granularity::Granularity;

pub const DELETED_COL: &str = "__deleted";
pub const ROW_COL: &str = "__row";

#[derive(Debug, PartialEq, Eq)]
pub enum MergeAction {
    Discard,
    SetColumn { col: String, value: Option<Vec<u8>> },
    UpsertRow { value: Vec<u8> },
    DeleteRow,
}

/// Column mode forbids the row-mode-only `__row` marker; row mode only ever
/// carries `__row` or the shared `__deleted` tombstone marker.
pub fn validate_cell_shape(
    table: &str,
    col: &str,
    granularity: Granularity,
) -> Result<(), SyncError> {
    match granularity {
        Granularity::Column if col == ROW_COL => Err(SyncError::CellShapeMismatch {
            table: table.to_string(),
            col: col.to_string(),
            granularity: granularity.to_string(),
        }),
        Granularity::Row if col != ROW_COL && col != DELETED_COL => {
            Err(SyncError::CellShapeMismatch {
                table: table.to_string(),
                col: col.to_string(),
                granularity: granularity.to_string(),
            })
        }
        _ => Ok(()),
    }
}

/// Decides what to do with an incoming cell that has already won the per-cell
/// HLC race (i.e. `incoming.hlc > existing_hlc`, enforced by the caller's
/// clock-guarded upsert). `tombstone_hlc` is the row's current `__deleted`
/// cell HLC, if any — independent of which column this particular cell is.
/// A delete always wins over a column/row update regardless of HLC order.
pub fn decide(
    col: &str,
    value: Option<&[u8]>,
    tombstone_hlc: Option<&Hlc>,
    granularity: Granularity,
) -> Result<MergeAction, SyncError> {
    if col == DELETED_COL {
        return Ok(MergeAction::DeleteRow);
    }

    if tombstone_hlc.is_some() {
        // Delete always wins over a column/row update, regardless of HLC
        // order: once a row is deleted, it stays deleted until a `__deleted`
        // cell itself loses the HLC race (see `apply_remote_inner`'s `won`
        // check) or is superseded by a newer tombstone.
        return Ok(MergeAction::Discard);
    }
    match granularity {
        Granularity::Column => Ok(MergeAction::SetColumn {
            col: col.to_string(),
            value: value.map(|v| v.to_vec()),
        }),
        Granularity::Row => {
            let value = value.ok_or_else(|| SyncError::InvalidRowPayload {
                table: String::new(),
                reason: "row-mode '__row' cell had a NULL value".to_string(),
            })?;
            Ok(MergeAction::UpsertRow {
                value: value.to_vec(),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hlc(physical_ms: u64, counter: u32) -> Hlc {
        Hlc::new(
            physical_ms,
            counter,
            crate::sync::hlc::DeviceId::from_name("device-a"),
        )
    }

    #[test]
    fn decide_no_tombstone_column_mode_returns_set_column() {
        // Arrange

        // Act

        let actual = decide("title", Some(b"hello"), None, Granularity::Column).unwrap();

        // Assert

        assert_eq!(
            MergeAction::SetColumn {
                col: "title".to_string(),
                value: Some(b"hello".to_vec())
            },
            actual
        );
    }

    #[test]
    fn decide_tombstone_lower_than_update_still_discards() {
        // Arrange

        let tombstone = hlc(1000, 0);

        // Act

        let actual = decide(
            "title",
            Some(b"hello"),
            Some(&tombstone),
            Granularity::Column,
        )
        .unwrap();

        // Assert

        assert_eq!(MergeAction::Discard, actual);
    }

    #[test]
    fn decide_tombstone_higher_than_update_discards() {
        // Arrange

        let tombstone = hlc(3000, 0);

        // Act

        let actual = decide(
            "title",
            Some(b"hello"),
            Some(&tombstone),
            Granularity::Column,
        )
        .unwrap();

        // Assert

        assert_eq!(MergeAction::Discard, actual);
    }

    #[test]
    fn decide_tombstone_present_row_mode_delete_wins_over_update() {
        // Arrange

        let tombstone = hlc(1000, 0);
        let payload = br#"{"id":"1"}"#;

        // Act

        let actual = decide(ROW_COL, Some(payload), Some(&tombstone), Granularity::Row).unwrap();

        // Assert

        assert_eq!(MergeAction::Discard, actual);
    }

    #[test]
    fn decide_deleted_col_returns_delete_row_regardless_of_tombstone() {
        // Arrange

        // Act

        let actual = decide(DELETED_COL, None, None, Granularity::Column).unwrap();

        // Assert

        assert_eq!(MergeAction::DeleteRow, actual);
    }

    #[test]
    fn decide_row_mode_returns_upsert_row() {
        // Arrange

        let payload = br#"{"id":"1"}"#;

        // Act

        let actual = decide(ROW_COL, Some(payload), None, Granularity::Row).unwrap();

        // Assert

        assert_eq!(
            MergeAction::UpsertRow {
                value: payload.to_vec()
            },
            actual
        );
    }

    #[test]
    fn validate_cell_shape_column_mode_rejects_row_marker() {
        // Arrange

        let table = "notes";

        // Act

        let actual = validate_cell_shape(table, ROW_COL, Granularity::Column);

        // Assert

        assert!(matches!(actual, Err(SyncError::CellShapeMismatch { .. })));
    }

    #[test]
    fn validate_cell_shape_row_mode_rejects_arbitrary_column() {
        // Arrange

        let table = "notes";

        // Act

        let actual = validate_cell_shape(table, "title", Granularity::Row);

        // Assert

        assert!(matches!(actual, Err(SyncError::CellShapeMismatch { .. })));
    }

    #[test]
    fn validate_cell_shape_row_mode_accepts_row_marker() {
        // Arrange

        let table = "notes";

        // Act

        let actual = validate_cell_shape(table, ROW_COL, Granularity::Row);

        // Assert

        assert!(actual.is_ok());
    }

    #[test]
    fn validate_cell_shape_row_mode_accepts_deleted_marker() {
        // Arrange

        let table = "notes";

        // Act

        let actual = validate_cell_shape(table, DELETED_COL, Granularity::Row);

        // Assert

        assert!(actual.is_ok());
    }

    #[test]
    fn validate_cell_shape_column_mode_accepts_deleted_marker() {
        // Arrange

        let table = "notes";

        // Act

        let actual = validate_cell_shape(table, DELETED_COL, Granularity::Column);

        // Assert

        assert!(actual.is_ok());
    }
}
