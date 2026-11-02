//! `ObjectFetcher` may fail after announcing an historical checkout's actual requested IDs.
//!
//! Extends [`Progress`] with [`Progress::render_history_pending`] over [`Output`] and [`Value`].
use super::{Progress, decline, import, import_message};
use bit_install::output::Output;
use serde_json::{Value, json};
use std::io;

impl Progress {
    /// Render pending historical checkout import progress from `value` into `output`.
    #[inline]
    pub(in crate::commands) fn render_history_pending(
        output: &Output,
        value: Option<&Value>,
    ) -> io::Result<()> {
        let Some(value) = value.filter(|value| !value.is_null()) else { return Ok(()) };
        if !value.is_object() {
            return Err(decline("lane history pending import receipt"));
        }
        let (Some(performed), Some(completed), Some(requested)) = (
            value["performed"].as_bool(),
            value["completed"].as_bool(),
            value["requested"].as_u64(),
        ) else {
            return Err(decline("lane history pending import receipt"));
        };
        if unexpected_history_fields(value) {
            return Err(decline("lane history pending import receipt"));
        }
        let row = import(
            &json!({"ids":value["ids"],"reason":null,"components":0,"objects":0,"requested":requested}),
        )?;
        if requested != row.ids.len() as u64
            || performed == row.ids.is_empty()
            || row.ids
                .iter()
                .any(|id| id.trim().is_empty())
        {
            return Err(decline("lane history pending import receipt"));
        }
        if performed && !completed {
            output.restart(&import_message(&row));
        }
        Ok(())
    }
}

/// Returns `true` when `value` carries unexpected `reason` or truthy `objectRequest` fields.
#[inline]
fn unexpected_history_fields(value: &Value) -> bool {
    !value["reason"].is_null()
        || (!value["objectRequest"].is_null() && value["objectRequest"] != Value::Bool(false))
}
