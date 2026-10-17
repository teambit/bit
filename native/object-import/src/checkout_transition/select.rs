use input::{
    Begin, Component, CurrentObservation, ModifiedObservation, Options, Receipt,
    RemovedObservation, validate,
};
use serde_json::{Value, json};
mod input;
use sha1::{Digest, Sha1};
use std::{collections::HashMap, io};

#[cfg(test)]
mod tests;

#[derive(Default)]
pub(super) struct State {
    records: HashMap<String, Record>,
    sequence: u64,
    bytes: usize,
}
#[derive(Clone, Copy)]
enum Stage {
    Unmerged,
    ResolveTarget,
    HasVersion,
    CurrentVersion,
    MergePending,
    Modified,
    TargetRemoved,
    Terminal,
}
#[derive(Clone)]
struct Record {
    revision: u32,
    component: Component,
    options: Options,
    stage: Stage,
    target: String,
    current: CurrentState,
}
impl State {
    pub(super) fn begin(&mut self, input: &Value) -> io::Result<Value> {
        let request: Begin = serde::Deserialize::deserialize(input).map_err(io::Error::other)?;
        validate(&request)?;
        let sequence = self.sequence
            .checked_add(1)
            .ok_or_else(|| invalid("checkout select sequence limit"))?;
        let mut digest = Sha1::new();
        digest.update(sequence.to_be_bytes());
        digest.update(serde_json::to_vec(&input).map_err(io::Error::other)?);
        let token = crate::validate::hexadecimal(&digest.finalize());
        let has_model = request.model.is_some();
        let main_missing = request.options.flags.main
            && request.model.as_ref().is_some_and(|model| !model.has_main_head);
        let mut record = Record {
            revision: 0,
            component: request.component,
            options: request.options,
            stage: Stage::Unmerged,
            target: String::new(),
            current: CurrentState::default(),
        };
        let directive = record.initial(has_model, main_missing);
        if self.records.len() >= 4096 || self.bytes + record.bytes() > 32 * 1024 * 1024 {
            return Err(invalid("checkout active select limit"));
        }
        let output = json!({"token":token,"revision":0,"directive":directive});
        self.sequence = sequence;
        if !matches!(record.stage, Stage::Terminal) {
            self.bytes += record.bytes();
            self.records.insert(token, record);
        }
        Ok(output)
    }
    pub(super) fn receipt(&mut self, input: Value) -> io::Result<Value> {
        let request: Receipt = serde_json::from_value(input).map_err(io::Error::other)?;
        let mut record = self.records
            .get(&request.token)
            .cloned()
            .ok_or_else(|| invalid("stale checkout select token"))?;
        if record.revision != request.revision || record.stage.name() != request.observation {
            return Err(invalid("stale checkout select receipt"));
        }
        let previous_bytes = record.bytes();
        let directive = record.advance(request.value)?;
        if self.bytes - previous_bytes + record.bytes() > 32 * 1024 * 1024 {
            return Err(invalid("checkout select metadata budget"));
        }
        record.revision = record.revision
            .checked_add(1)
            .ok_or_else(|| invalid("checkout select revision limit"))?;
        let output =
            json!({"token":request.token,"revision":record.revision,"directive":directive});
        if matches!(record.stage, Stage::Terminal) {
            self.records.remove(&request.token);
            self.bytes -= previous_bytes;
        } else {
            self.bytes = self.bytes - previous_bytes + record.bytes();
            self.records.insert(request.token, record);
        }
        Ok(output)
    }
}
impl Stage {
    fn name(self) -> &'static str {
        match self {
            Self::Unmerged => "unmerged",
            Self::ResolveTarget => "resolveTarget",
            Self::HasVersion => "hasVersion",
            Self::CurrentVersion => "currentVersion",
            Self::MergePending => "mergePending",
            Self::Modified => "modified",
            Self::TargetRemoved => "targetRemoved",
            Self::Terminal => "terminal",
        }
    }
}
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

impl Record {
    fn initial(&mut self, has_model: bool, main_missing: bool) -> Value {
        if !has_model {
            self.failure(
                format!("component {} is new, no version to checkout", self.component.id),
                true,
                None,
            )
        } else if main_missing {
            self.failure(
                format!("component {} is not available on main", self.component.id),
                false,
                None,
            )
        } else {
            self.observe(Stage::Unmerged)
        }
    }
    fn bytes(&self) -> usize {
        self.component.id.len()
            + self.component.id_without_version.len()
            + self.component.version.as_ref().map_or(0, String::len)
            + self.options.version.as_ref().map_or(0, String::len)
            + self.target.len()
            + self.current.value.as_ref().map_or(0, String::len)
            + 256
    }
    fn observe(&mut self, stage: Stage) -> Value {
        self.stage = stage;
        let mut output = json!({"kind":"observe","observation":stage.name()});
        let version = match stage {
            Stage::HasVersion => self.options.version.as_deref(),
            Stage::Modified => self.current.value.as_deref(),
            Stage::TargetRemoved => Some(self.target.as_str()),
            _ => None,
        };
        if let Some(version) = version {
            output["version"] = json!(version);
        }
        output
    }
    fn failure(&mut self, message: String, legitimate: bool, removed: Option<bool>) -> Value {
        self.stage = Stage::Terminal;
        let mut output = json!({"kind":"failure","legitimate":legitimate});
        output["message"] = Value::String(message);
        if removed == Some(true) {
            output["shouldBeRemoved"] = json!(true);
        }
        output
    }
    fn advance(&mut self, value: Value) -> io::Result<Value> {
        match self.stage {
            Stage::Unmerged => self.unmerged(boolean(&value)?),
            Stage::ResolveTarget => self.target(&value),
            Stage::HasVersion => self.has_version(boolean(&value)?),
            Stage::CurrentVersion => self.current(value),
            Stage::MergePending => self.merge_pending(boolean(&value)?),
            Stage::Modified => self.modified(value),
            Stage::TargetRemoved => self.removed(value),
            Stage::Terminal => Err(invalid("terminal checkout select receipt")),
        }
    }
    fn unmerged(&mut self, unmerged: bool) -> io::Result<Value> {
        if !self.options.flags.reset && unmerged {
            return Ok(self.failure(format!("component {} is in during-merge state, please snap/tag it first (or use bit merge --resolve/--abort)",self.component.id_without_version),false,None));
        }
        Ok(self.observe(Stage::ResolveTarget))
    }
    fn target(&mut self, value: &Value) -> io::Result<Value> {
        let target = value
            .as_str()
            .filter(|text| !text.is_empty() && text.len() <= 32768)
            .ok_or_else(|| invalid("checkout resolved target must be string"))?;
        target.clone_into(&mut self.target);
        if self.options.version
            .as_ref()
            .is_some_and(|version| !version.is_empty())
            && !self.options.flags.head
        {
            return Ok(self.observe(Stage::HasVersion));
        }
        Ok(self.observe(Stage::CurrentVersion))
    }
    fn has_version(&mut self, present: bool) -> io::Result<Value> {
        if !present {
            return Ok(self.failure(
                format!(
                    "component {} doesn't have version {}",
                    self.component.id_without_version,
                    self.options.version.as_deref().unwrap_or_default(),
                ),
                false,
                None,
            ));
        }
        Ok(self.observe(Stage::CurrentVersion))
    }
    fn current(&mut self, value: Value) -> io::Result<Value> {
        let observed: CurrentObservation = serde_json::from_value(value).map_err(io::Error::other)?;
        if observed.value
            .as_ref()
            .is_some_and(|value| value.len() > 32768)
        {
            return Err(invalid("checkout current version limit"));
        }
        self.current.value = observed.value;
        self.current.has_bitmap = observed.has_bitmap;
        Ok(self.current_policy())
    }
    fn current_policy(&mut self) -> Value {
        if self.current.has_bitmap && self.current.value.as_ref().is_none_or(String::is_empty) {
            return self.failure(
                format!("component {} is new", self.component.id_without_version),
                false,
                None,
            );
        }
        if self.already_current() {
            return self.failure(
                format!(
                    "component {} is already at version {}",
                    self.component.id_without_version,
                    self.options.version
                        .as_deref()
                        .filter(|version| !version.is_empty())
                        .unwrap_or(&self.target),
                ),
                true,
                None,
            );
        }
        if (self.options.flags.head || self.options.flags.latest)
            && self.current.value.as_deref() == Some(&self.target)
        {
            return self.failure(
                format!(
                    "component {} is already at the latest version, which is {}",
                    self.component.id_without_version, self.target,
                ),
                true,
                None,
            );
        }
        if !self.options.flags.reset {
            return self.observe(Stage::MergePending);
        }
        self.after_merge_pending()
    }
    fn already_current(&self) -> bool {
        self.options.version
            .as_deref()
            .filter(|version| !version.is_empty())
            .is_some_and(|version| self.current.value.as_deref() == Some(version))
            || (self.options.version_per_id.is_some()
                && self.current.value.as_deref() == Some(&self.target))
    }
    fn merge_pending(&mut self, pending: bool) -> io::Result<Value> {
        if pending {
            return Ok(self.failure(r#"component is merge-pending and cannot be checked out, run "bit status" for more info"#.into(),false,None));
        }
        Ok(self.after_merge_pending())
    }
    fn after_merge_pending(&mut self) -> Value {
        if self.current.value
            .as_ref()
            .is_some_and(|version| !version.is_empty())
        {
            self.observe(Stage::Modified)
        } else {
            self.observe(Stage::TargetRemoved)
        }
    }
    fn modified(&mut self, value: Value) -> io::Result<Value> {
        let observed: ModifiedObservation =
            serde_json::from_value(value).map_err(io::Error::other)?;
        if !observed.modified && !observed.is_removed && self.options.flags.reset {
            return Ok(self.failure(
                format!("component {} is not modified", self.component.id_without_version),
                true,
                None,
            ));
        }
        // The selected boolean is retained separately from the public component fields.
        self.current.modified = observed.modified;
        Ok(self.observe(Stage::TargetRemoved))
    }
    fn removed(&mut self, value: Value) -> io::Result<Value> {
        let observed: RemovedObservation = serde_json::from_value(value).map_err(io::Error::other)?;
        if observed.removed {
            return Ok(self.failure(
                "component has been removed".into(),
                true,
                Some(observed.has_bitmap),
            ));
        }
        let flags = &self.options.flags;
        let merge = !(flags.reset
            || (!self.current.modified && !flags.load_stash)
            || flags.revert
            || self.current.value.as_ref().is_none_or(String::is_empty)
            || flags.force_theirs
            || flags.force_ours);
        self.stage = Stage::Terminal;
        Ok(json!({"kind":"target","version":self.target,"merge":merge}))
    }
}
fn boolean(value: &Value) -> io::Result<bool> {
    value.as_bool().ok_or_else(|| invalid("checkout observation expected boolean"))
}

#[derive(Default, Clone)]
struct CurrentState {
    value: Option<String>,
    has_bitmap: bool,
    modified: bool,
}
