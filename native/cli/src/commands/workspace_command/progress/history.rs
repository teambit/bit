//! `ObjectFetcher` may fail after announcing an historical checkout's actual requested IDs.
use super::{Progress, decline, import, import_message};
use bit_install::output::Output;
use serde_json::{Value, json};
use std::io;

impl Progress {
    pub(in crate::commands) fn render_history_pending(
        output: &Output,
        value: Option<&Value>,
    ) -> io::Result<()> {
        let Some(value) = value.filter(|value| !value.is_null()) else { return Ok(()) };
        let performed = value["performed"].as_bool();
        let completed = value["completed"].as_bool();
        let requested = value["requested"].as_u64();
        let row = import(
            &json!({"ids":value["ids"],"reason":null,"components":0,"objects":0,"requested":requested}),
        )?;
        if performed.is_none()
            || completed.is_none()
            || requested != Some(row.ids.len() as u64)
            || performed != Some(!row.ids.is_empty())
            || row.ids
                .iter()
                .any(|id| id.trim().is_empty())
        {
            return Err(decline("lane history pending import receipt"));
        }
        if performed == Some(true) && completed == Some(false) && !row.ids.is_empty() {
            output.restart(&import_message(&row));
        }
        Ok(())
    }
}
