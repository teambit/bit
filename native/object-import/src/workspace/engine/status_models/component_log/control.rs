//! `ModelComponent.collectLogs` projects HEAD range/snap metadata over its history.
use node_semver::{Range, Version};
use serde_json::{Value, json};

#[derive(Default)]
pub(super) struct Control {
    removed: Option<Range>,
    snaps: Vec<String>,
    deprecated: Option<Value>,
}
impl Control {
    pub(super) fn read(version: &Value) -> Self {
        let config = |name: &str| {
            version["extensions"]
                .as_array()
                .and_then(|rows| {
                    rows.iter()
                        .find(|row| {
                            crate::workspace::engine::client_status::config::is_extension_aspect(
                                row, name,
                            )
                        })
                })
                .map(|row| &row["config"])
        };
        let removed = config("teambit.component/remove");
        let deprecated = config("teambit.component/deprecation");
        Self {
            removed: removed
                .and_then(|config| config["range"].as_str())
                .and_then(|range| Range::parse(range.trim()).ok()),
            snaps: removed
                .and_then(|config| config["snaps"].as_array())
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|snap| !snap.is_empty())
                .map(str::to_owned)
                .collect(),
            deprecated: deprecated
                .and_then(|config| config.get("range"))
                .cloned(),
        }
    }
    pub(super) fn apply(&self, rows: &mut [Value]) {
        for row in rows {
            row["deleted"] = json!(self.removed(row));
            if let (Some(tag), Some(range)) = (row["tag"].as_str(), &self.deprecated) {
                row["deprecated"] = deprecation(range, tag);
            }
        }
    }
    fn removed(&self, row: &Value) -> bool {
        if let Some(tag) = row["tag"]
            .as_str()
            .and_then(|tag| Version::parse(tag.trim()).ok())
        {
            return self.removed
                .as_ref()
                .is_some_and(|range| range.satisfies(&tag));
        }
        row["hash"]
            .as_str()
            .map(str::trim)
            .is_some_and(|hash| {
                self.snaps
                    .iter()
                    .any(|snap| snap.eq_ignore_ascii_case(hash))
            })
    }
}

pub(super) fn staged(rows: &mut [Value], config: &Value) {
    let range = config["range"]
        .as_str()
        .and_then(|range| Range::parse(range.trim()).ok());
    for row in rows {
        row["deprecated"] = json!(
            range
                .as_ref()
                .zip(
                    row["tag"]
                        .as_str()
                        .and_then(|tag| Version::parse(tag.trim()).ok())
                )
                .is_some_and(|(range, tag)| range.satisfies(&tag))
        );
    }
}

fn deprecation(range: &Value, tag: &str) -> Value {
    if range.is_null()
        || range.as_bool() == Some(false)
        || range.as_str() == Some("")
        || range.as_f64() == Some(0.0)
    {
        return range.clone();
    }
    json!(
        range
            .as_str()
            .and_then(|range| Range::parse(range).ok())
            .zip(Version::parse(tag).ok())
            .is_some_and(|(range, tag)| range.satisfies(&tag))
    )
}
