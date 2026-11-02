//! `ConfigMerger` execution state ([`Engine`]), trace/debug log collection, and aspect lookup helpers.

use super::super::{array, invalid, text};
use serde_json::{Value, json};
use std::io;

/// Per-component `ConfigMerger` accumulator tracking merged rows, logs, envs, and conflicts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Engine<'a> {
    pub input: &'a Value,
    pub rows: Vec<Value>,
    pub logs: Vec<Value>,
    pub handled: Vec<String>,
    pub envs: Vec<Value>,
    pub assignments: Vec<Value>,
    pub conflicts: Vec<Value>,
}
impl<'a> Engine<'a> {
    /// Validate required input arrays and initialize a new per-component `ConfigMerger` [`Engine`].
    pub(super) fn new(input: &'a Value) -> io::Result<Self> {
        for side in ["current", "base", "other", "workspaceIds", "otherLaneIds", "coreNames"] {
            array(input, side)?;
        }
        Ok(Self {
            input,
            rows: Vec::new(),
            logs: Vec::new(),
            handled: vec!["teambit.pipelines/builder".into(), "teambit.envs/envs".into()],
            envs: Vec::new(),
            assignments: Vec::new(),
            conflicts: Vec::new(),
        })
    }
    /// Emit the initial `config-merger` debug banner and `currentLabel`/`otherLabel` log lines.
    pub(super) fn start(&mut self) -> io::Result<()> {
        self.log(
            "debug",
            format!(
                "\n************** start config-merger for {} **************",
                text(self.input, "compIdStr")?,
            ),
        );
        self.log("debug", format!("currentLabel: {}", text(self.input, "currentLabel")?));
        self.log("debug", format!("otherLabel: {}", text(self.input, "otherLabel")?));
        Ok(())
    }
    /// Append a structured log entry with `level` and `message` to `self.logs`.
    #[inline]
    pub(super) fn log(&mut self, level: &str, message: String) {
        let mut entry = json!({"level":level});
        entry["message"] = Value::String(message);
        self.logs.push(entry);
    }
    /// Append a structured metadata log entry (`meta` or `metaUndefined`) to `self.logs`.
    #[inline]
    pub(super) fn meta(&mut self, level: &str, message: &str, value: Option<&Value>) {
        self.logs.push(match value {
            Some(value) => json!({"level":level,"message":message,"meta":[value]}),
            None => json!({"level":level,"message":message,"metaUndefined":true}),
        });
    }
    /// Return the configured merge strategy (`"ours"`, `"theirs"`, or default `"manual"`).
    #[inline]
    pub(super) fn strategy(&self) -> &str {
        self.input["strategy"]
            .as_str()
            .map(str::trim)
            .filter(|strategy| !strategy.is_empty())
            .unwrap_or("manual")
    }
    pub(super) fn find(&self, side: &str, id: &str) -> io::Result<Option<usize>> {
        let id = id.trim();
        let core = array(self.input, "coreNames")?
            .iter()
            .any(|name| name.as_str().map(str::trim) == Some(id));
        let base_id = id.rsplit_once('@').map_or(id, |(base, _)| base.trim());
        Ok(array(self.input, side)?
            .iter()
            .position(|entry| {
                if core {
                    entry["name"].as_str().map(str::trim) == Some(id)
                } else {
                    let comp_base = entry["componentId"]["base"].as_str().map(str::trim);
                    let comp_id = entry["componentId"].as_str().map(str::trim);
                    comp_base == Some(id)
                        || comp_base == Some(base_id)
                        || comp_id == Some(id)
                        || comp_id == Some(base_id)
                }
            }))
    }
    #[inline]
    pub(super) fn source(side: &str, index: usize) -> Value {
        json!({"source":{"side":side,"index":index}})
    }
    fn equal(&self, left: &Value, right: &Value) -> io::Result<bool> {
        let serialized = |selector: &Value| -> io::Result<std::borrow::Cow<'_, str>> {
            if let Some(source) = selector.get("source") {
                let side = text(source, "side")?.trim();
                let index =
                    source["index"].as_u64().ok_or_else(|| invalid("config selector"))? as usize;
                let entry = self.input
                    .get(side)
                    .and_then(|rows| rows.get(index))
                    .ok_or_else(|| invalid("config selector"))?;
                Ok(std::borrow::Cow::Borrowed(text(entry, "configJson")?))
            } else {
                serde_json::to_string(&selector["value"])
                    .map(std::borrow::Cow::Owned)
                    .map_err(io::Error::other)
            }
        };
        Ok(serialized(left)? == serialized(right)?)
    }
    pub(super) fn basic(
        &mut self,
        id: &str,
        current: &Value,
        other: &Value,
        base: Option<&Value>,
    ) -> io::Result<()> {
        if self.equal(current, other)?
            || base
                .as_ref()
                .map(|base| self.equal(base, other))
                .transpose()?
                .unwrap_or(false)
        {
            return Ok(());
        }
        if base
            .as_ref()
            .map(|base| self.equal(base, current))
            .transpose()?
            .unwrap_or(false)
            || self.strategy() == "theirs"
        {
            self.rows.push(json!({"id":id,"merged":other}));
        } else if self.strategy() != "ours" {
            let mut conflict =
                json!({"kind":"basic","current":current,"other":other,"baseOwn":true});
            if let Some(base) = base {
                conflict["base"] = base.clone();
            }
            self.rows.push(json!({"id":id,"conflict":conflict}));
        }
        Ok(())
    }
    pub(super) fn local(&self, id: &str, version: Option<&str>) -> io::Result<bool> {
        let id = id.trim();
        if array(self.input, "workspaceIds")?
            .iter()
            .any(|entry| entry["base"].as_str().map(str::trim) == Some(id))
        {
            return Ok(true);
        }
        let version = version
            .map(str::trim)
            .filter(|val| !val.is_empty())
            .unwrap_or("undefined");
        Ok(array(self.input, "otherLaneIds")?
            .iter()
            .any(|entry| {
                entry
                    .as_str()
                    .and_then(|raw| raw.trim().strip_prefix(id))
                    .and_then(|rest| rest.strip_prefix('@'))
                    == Some(version)
            }))
    }
}
