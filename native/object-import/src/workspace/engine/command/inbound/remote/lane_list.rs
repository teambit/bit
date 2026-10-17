//! The visible heads of the active remote Lane, before main-only wildcard matches.
use super::{Listed, invalid};
use crate::command_import::lane;
use std::io;

pub(super) fn visible(entries: Vec<lane::Entry>) -> io::Result<Vec<Listed>> {
    entries
        .into_iter()
        .filter(|entry| !entry.hidden)
        .map(|entry| {
            let (scope, name) = entry.identity
                .split_once('/')
                .ok_or_else(|| invalid("inbound lane component identity"))?;
            Ok(Listed {
                scope: scope.to_owned(),
                name: name.to_owned(),
                version: Some(entry.head),
                // Node filters deprecation only for the main-scope list.
                deprecated: false,
            })
        })
        .collect()
}
