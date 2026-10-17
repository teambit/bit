//! Lane-related sections of `formatStatusOutput`.

use super::{Status, ids};
use crate::commands::status::js::{array, text};
use std::io;

pub(super) const UPDATES_FROM_MAIN: &str = r#"(use "bit lane merge main" to merge the changes)"#;

impl Status<'_> {
    pub(super) fn updates_from_main(&self) -> io::Result<Vec<String>> {
        self.updates("pendingUpdatesFromMain", "main")
    }

    pub(super) fn updates_from_forked(&self) -> io::Result<Vec<String>> {
        let id = text(self.result.get("forkedLaneId"))?;
        let (_, name) = id.split_once('/').ok_or_else(|| io::Error::other("forked lane id"))?;
        self.updates("updatesFromForked", name)
    }

    fn updates(&self, field: &str, from: &str) -> io::Result<Vec<String>> {
        array(self.result.get(field), field)?
            .iter()
            .map(|row| {
                let id = text(row.get("id"))?;
                let target = array(row["divergeData"].get("snapsOnTargetOnly"), "target snaps")?;
                let mut message = format!("{from} is ahead by {} snaps", target.len());
                if self.flags.verbose
                    && !array(row["divergeData"].get("snapsOnSourceOnly"), "lane snaps")?.is_empty()
                {
                    let common = text(
                        row["divergeData"]
                            .get("commonSnapBeforeDiverge")
                            .and_then(|value| value.get("hash")),
                    )?;
                    message.push_str(" (diverged since ");
                    message.push_str(&common[..common.len().min(9)]);
                    message.push(')');
                }
                let forked = array(self.result.get("updatesFromForked"), "forked updates")?;
                let warn = field == "updatesFromForked" || forked.iter().any(|row| row["id"] == id);
                self.item_with_message(id, &message, warn)
            })
            .collect()
    }

    pub(super) fn unavailable_on_main(&self) -> io::Result<Vec<String>> {
        Ok(ids(self.result, "unavailableOnMain")?
            .iter()
            .map(|identity| self.item((identity, None), false, None, true))
            .collect())
    }
}
