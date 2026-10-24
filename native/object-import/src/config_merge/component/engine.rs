use super::super::{array, invalid, text};
use serde_json::{Value, json};
use std::io;

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
    pub(super) fn log(&mut self, level: &str, message: String) {
        let mut entry = json!({"level":level});
        entry["message"] = Value::String(message);
        self.logs.push(entry);
    }
    pub(super) fn meta(&mut self, level: &str, message: &str, value: Option<&Value>) {
        self.logs.push(match value {
            Some(value) => json!({"level":level,"message":message,"meta":[value]}),
            None => json!({"level":level,"message":message,"metaUndefined":true}),
        });
    }
    pub(super) fn strategy(&self) -> &str {
        self.input["strategy"].as_str().unwrap_or("manual")
    }
    pub(super) fn find(&self, side: &str, id: &str) -> io::Result<Option<usize>> {
        let core = array(self.input, "coreNames")?
            .iter()
            .any(|name| name == id);
        Ok(array(self.input, side)?
            .iter()
            .position(
                |entry| if core { entry["name"] == id } else { entry["componentId"]["base"] == id },
            ))
    }
    pub(super) fn source(side: &str, index: usize) -> Value {
        json!({"source":{"side":side,"index":index}})
    }
    fn equal(&self, left: &Value, right: &Value) -> io::Result<bool> {
        let serialized = |selector: &Value| -> io::Result<String> {
            if let Some(source) = selector.get("source") {
                let side = text(source, "side")?;
                let index =
                    source["index"].as_u64().ok_or_else(|| invalid("config selector"))? as usize;
                Ok(text(&self.input[side][index], "configJson")?.into())
            } else {
                serde_json::to_string(&selector["value"]).map_err(io::Error::other)
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
        Ok(array(self.input, "workspaceIds")?
            .iter()
            .any(|entry| entry["base"] == id)
            || array(self.input, "otherLaneIds")?
                .iter()
                .any(|entry| entry == &format!("{id}@{}", version.unwrap_or("undefined"))))
    }
}
