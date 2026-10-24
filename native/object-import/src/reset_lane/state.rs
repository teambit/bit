use super::{BitmapState, bitmap, bitmap_key, invalid};
use serde_json::Value;
use std::{fs, io, path::Path};

impl BitmapState {
    pub(super) fn load(root: &Path, scope: &str, name: &str) -> io::Result<Self> {
        let before = fs::read(root.join(".bitmap"))?;
        let mut document = crate::recovery::jsonc::parse(&before)?;
        let rows = document.as_object().ok_or_else(|| invalid("lane reset bitmap"))?;
        let lane = &rows["_bit_lane"];
        let lane_scope = lane["id"]["scope"]
            .as_str()
            .ok_or_else(|| invalid("lane reset scope"))?
            .to_owned();
        let lane_name = lane["id"]["name"]
            .as_str()
            .ok_or_else(|| invalid("lane reset name"))?
            .to_owned();
        let exported =
            lane["exported"].as_bool().ok_or_else(|| invalid("lane reset export state"))?;
        let Some((key, restored)) =
            restore_row(root, &mut document, (&lane_scope, &lane_name), scope, name)?
        else {
            return Ok(Self {
                before,
                document,
                key: String::new(),
                lane_scope,
                lane_name,
                exported,
                staged_config: None,
                restored: false,
            });
        };
        let rows = document.as_object().ok_or_else(|| invalid("lane reset bitmap"))?;
        if rows[&key]["config"]["teambit.component/remove"]["removed"] == true
            || rows[&key]["isAvailableOnCurrentLane"] == false
        {
            return Err(invalid("lane reset unavailable component"));
        }
        let staged_config =
            crate::reset_config::read(root, Some((&lane_scope, &lane_name)), scope, name)?;
        Ok(Self { before, document, key, lane_scope, lane_name, exported, staged_config, restored })
    }

    /// Scope.isExported excludes only unscoped visible workspace IDs; hidden scoped IDs remain exported.
    pub(super) fn component_is_exported(&self, model: &Value) -> bool {
        model["scope"]
            .as_str()
            .is_some_and(|scope| !scope.is_empty())
            && (self.key.is_empty()
                || self.document[&self.key]["scope"]
                    .as_str()
                    .is_some_and(|scope| !scope.is_empty()))
    }

    pub(super) fn validate_head(&self, model: &Value, head: &str) -> io::Result<()> {
        if !self.key.is_empty()
            && !self.restored
            && self.document[&self.key]["version"] != head
            && self.document[&self.key]["version"]
                .as_str()
                .is_none_or(|version| model["versions"][version] != head)
        {
            return Err(invalid("lane reset bitmap head mismatch"));
        }
        Ok(())
    }

    pub(super) fn project(&mut self, model: &Value, next: Option<String>) -> io::Result<String> {
        if self.key.is_empty() {
            return Ok(String::new());
        }
        let version = next.map_or_else(String::new, |hash| {
            model["versions"]
                .as_object()
                .and_then(|versions| {
                    versions
                        .iter()
                        .find_map(|(tag, value)| (value == &hash).then_some(tag.clone()))
                })
                .unwrap_or(hash)
        });
        let row = self.document[&self.key]
            .as_object_mut()
            .ok_or_else(|| invalid("lane reset bitmap row"))?;
        row.insert("version".into(), Value::String(version.clone()));
        row.shift_remove("nextVersion");
        crate::reset_config::restore(row, self.staged_config.clone());
        if version.is_empty()
            && model["versions"].as_object().is_some_and(serde_json::Map::is_empty)
        {
            row.shift_remove("onLanesOnly");
            row.shift_remove("isAvailableOnCurrentLane");
        }
        Ok(version)
    }

    pub(super) fn after(&self) -> io::Result<Vec<u8>> {
        if self.key.is_empty() {
            return Ok(self.before.clone());
        }
        crate::inspection::render_bitmap(&self.document)
    }
}

fn restore_row(
    root: &Path,
    document: &mut Value,
    lane: (&str, &str),
    scope: &str,
    name: &str,
) -> io::Result<Option<(String, bool)>> {
    let rows = document.as_object().ok_or_else(|| invalid("lane reset bitmap"))?;
    if let Ok(key) = bitmap_key(rows, scope, name) {
        return Ok(Some((key, false)));
    }
    let Some(restored) = crate::reset_config::removed_lane_row(root, lane.0, lane.1, scope, name)?
    else {
        return Ok(None);
    };
    let rows = document.as_object_mut().ok_or_else(|| invalid("lane reset bitmap"))?;
    bitmap::insert(rows, name, restored)?;
    Ok(Some((bitmap_key(rows, scope, name)?, true)))
}
