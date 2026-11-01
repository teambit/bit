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
        let name = if let Some(name) = self.result["forkedLaneId"]["name"]
            .as_str()
            .map(str::trim)
            .filter(|name| !name.is_empty())
        {
            name
        } else {
            let id = text(self.result.get("forkedLaneId"))?.trim();
            id.split_once('/').map_or(id, |(_, name)| name.trim())
        };
        if name.is_empty() {
            return Err(crate::commands::status::js::decline("status report forked lane name"));
        }
        self.updates("updatesFromForked", name)
    }

    fn updates(&self, field: &str, from: &str) -> io::Result<Vec<String>> {
        let rows = array(self.result.get(field), field)?;
        let forked = if field == "updatesFromForked" {
            &[][..]
        } else {
            array(self.result.get("updatesFromForked"), "forked updates")?
        };
        rows.iter()
            .map(|row| {
                let id = row_id(row)?;
                let target = array(row["divergeData"].get("snapsOnTargetOnly"), "target snaps")?;
                let mut message = format!("{from} is ahead by {} snaps", target.len());
                if self.flags.verbose
                    && let Some(common) = diverge_hash(&row["divergeData"])?
                {
                    message.push_str(" (diverged since ");
                    message.push_str(common);
                    message.push(')');
                }
                let warn = field == "updatesFromForked"
                    || forked
                        .iter()
                        .any(|entry| row_id(entry).ok().as_deref() == Some(id.as_str()));
                self.item_with_message(&id, &message, warn)
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

fn diverge_hash(diverge_data: &serde_json::Value) -> io::Result<Option<&str>> {
    if array(diverge_data.get("snapsOnSourceOnly"), "lane snaps")?.is_empty() {
        return Ok(None);
    }
    let Some(common) = diverge_data
        .get("commonSnapBeforeDiverge")
        .and_then(|value| value.get("hash").or(Some(value)))
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|hash| !hash.is_empty())
    else {
        return Ok(None);
    };
    let end = common
        .char_indices()
        .nth(9)
        .map_or(common.len(), |(idx, _)| idx);
    Ok(Some(&common[..end]))
}

fn row_id(row: &serde_json::Value) -> io::Result<String> {
    if let Some(id) = row["id"]
        .as_str()
        .or_else(|| row["identity"].as_str())
        .map(str::trim)
        .filter(|id| !id.is_empty())
    {
        return Ok(id.to_owned());
    }
    if let Some(name) = row["id"]["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
    {
        return Ok(
            match row["id"]["scope"]
                .as_str()
                .map(str::trim)
                .filter(|scope| !scope.is_empty())
            {
                Some(scope) => format!("{scope}/{name}"),
                None => name.to_owned(),
            },
        );
    }
    text(row.get("id")).map(|id| id.trim().to_owned())
}
