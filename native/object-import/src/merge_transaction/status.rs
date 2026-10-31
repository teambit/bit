use super::{decision::boolean, invalid, journal};
use serde::Deserialize;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{collections::HashMap, io};
#[derive(Default)]
pub(super) struct State {
    records: HashMap<String, Cursor>,
    sequence: u64,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Identity {
    token: String,
    index: usize,
    id: String,
    id_without_version: String,
    has_consumer: bool,
    has_workspace: bool,
}
#[derive(Default, Clone)]
struct Removed {
    marked: bool,
    other_lane: bool,
    on_main: bool,
}
#[derive(Clone)]
struct Cursor {
    identity: Identity,
    revision: u32,
    observe: String,
    selector: &'static str,
    removed: Removed,
    target_only: bool,
    result: Option<Value>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Receipt {
    token: String,
    revision: u32,
    observe: String,
    value: Value,
}
impl Cursor {
    fn output(&self, token: &str) -> Value {
        if let Some(result) = &self.result {
            json!({"token":token,"revision":self.revision,"result":result})
        } else {
            json!({"token":token,"revision":self.revision,"directive":{"observe":self.observe,"selector":self.selector}})
        }
    }
    fn next(&mut self, observe: &str) {
        observe.clone_into(&mut self.observe);
    }
    fn unchanged(&mut self, message: String, legitimate: bool) {
        self.result = Some(
            json!({"action":"unchanged","message":Value::String(message),"legitimate":legitimate}),
        );
    }
    fn success(&mut self, action: &str) {
        self.result = Some(json!({"action":action,"shouldBeRemoved":self.removed.marked}));
    }
    fn transition(&mut self, value: &Value) -> io::Result<()> {
        match self.observe.as_str() {
            "model" => self.model(value),
            "unmerged" => self.unmerged(value),
            "incoming" => self.incoming(value),
            "removeOnMain" => self.remove_main(value),
            "mainHead" => self.main_head(value),
            "currentId" => self.current_id(value),
            "locallyRemoved" => self.locally_removed(value),
            "current" => self.current(value),
            "removedMain" => {
                self.removed.on_main = boolean(value, "removeOnMain")?;
                self.next("removedDivergence");
                Ok(())
            }
            "removedDivergence" => self.removed_divergence(value),
            "modified" => self.modified(value),
            "divergence" => self.divergence(value),
            "unrelated" => self.unrelated(value),
            "unrelatedFailure" => {
                self.unchanged(
                    value["message"]
                        .as_str()
                        .ok_or_else(|| invalid("merge unrelated message"))?
                        .to_owned(),
                    false,
                );
                Ok(())
            }
            _ => Err(invalid("merge status observation")),
        }
    }
    fn model(&mut self, value: &Value) -> io::Result<()> {
        if boolean(value, "present")? {
            self.next("unmerged");
        } else {
            self.unchanged(format!("component {} is on the lane/main but its objects were not found, please re-import the lane",self.identity.id),false);
        }
        Ok(())
    }
    fn unmerged(&mut self, value: &Value) -> io::Result<()> {
        if boolean(value, "present")? {
            self.unchanged(format!("component {} is in during-merge state a previous merge, please snap/tag it first (or use bit merge --resolve/--abort/ bit lane merge-abort)",self.identity.id_without_version),false);
        } else {
            self.next("incoming");
        }
        Ok(())
    }
    fn incoming(&mut self, value: &Value) -> io::Result<()> {
        let lane = boolean(value, "onLane")?;
        self.selector = current_selector(value, lane)?;
        if boolean(value, "removed")? {
            if lane {
                self.removed.marked = true;
                self.next("currentId");
            } else {
                self.next("removeOnMain");
            }
        } else {
            self.next("currentId");
        }
        Ok(())
    }
    fn remove_main(&mut self, value: &Value) -> io::Result<()> {
        if boolean(value, "removeOnMain")? {
            self.next("mainHead");
        } else {
            self.deleted();
        }
        Ok(())
    }
    fn main_head(&mut self, value: &Value) -> io::Result<()> {
        if boolean(value, "present")? {
            self.removed.marked = true;
            self.next("currentId");
        } else {
            self.deleted();
        }
        Ok(())
    }
    fn deleted(&mut self) {
        self.unchanged("component has been removed".to_owned(), true);
    }
    fn current_id(&mut self, value: &Value) -> io::Result<()> {
        if boolean(value, "present")? {
            self.next("locallyRemoved");
        } else {
            self.target_only = true;
            self.next("divergence");
        }
        Ok(())
    }
    fn locally_removed(&mut self, value: &Value) -> io::Result<()> {
        if boolean(value, "removed")? {
            self.unchanged(
                "component is locally deleted, please snap and export first or undo by bit recover"
                    .to_owned(),
                false,
            );
        } else {
            self.next("current");
        }
        Ok(())
    }
    fn current(&mut self, value: &Value) -> io::Result<()> {
        if boolean(value, "removed")? {
            self.next("removedMain");
        } else {
            self.modification();
        }
        Ok(())
    }
    fn removed_divergence(&mut self, value: &Value) -> io::Result<()> {
        self.removed.other_lane = boolean(value, "otherLanePresent")?;
        let ignore = if self.removed.other_lane {
            !boolean(value, "error")? && !boolean(value, "targetAhead")?
        } else {
            !self.removed.on_main
        };
        if ignore {
            self.deleted();
        } else {
            self.modification();
        }
        Ok(())
    }
    fn modification(&mut self) {
        self.next(if self.identity.has_consumer && self.identity.has_workspace {
            "modified"
        } else {
            "divergence"
        });
    }
    fn modified(&mut self, value: &Value) -> io::Result<()> {
        match value.get("type").and_then(Value::as_str) {
            Some("code")=>self.unchanged("component is modified, please snap/tag it first".to_owned(),false),
            Some("config") if !boolean(value,"ignoreConfigChanges")?=>self.unchanged("component has config changes, please snap/tag it first. alternatively, use --ignore-config-changes flag to bypass".to_owned(),false),
            None | Some("config")=>self.next("divergence"),
            _=>return Err(invalid("merge modification type")),
        }
        Ok(())
    }
    fn divergence(&mut self, value: &Value) -> io::Result<()> {
        if self.target_only {
            self.success("target");
            return Ok(());
        }
        if let Some(error) = value
            .get("error")
            .filter(|error| !error.is_null())
        {
            self.divergence_error(value, error)?;
        } else if boolean(value, "detachHead")? && value["common"].as_str().is_some() {
            self.success("detach");
        } else if already_merged(value)? {
            self.unchanged("component is already merged".to_owned(), true);
        } else if !boolean(value, "diverged")?
            && (!boolean(value, "handleTargetAheadAsDiverged")?
                || value["common"].as_str().is_none())
        {
            self.success("target");
        } else {
            self.success("merge");
        }
        Ok(())
    }
    fn divergence_error(&mut self, value: &Value, error: &Value) -> io::Result<()> {
        if error["kind"] == "noCommon"
            && value["resolveUnrelated"]
                .as_str()
                .is_some_and(|strategy| !strategy.is_empty())
        {
            self.next("unrelated");
        } else {
            self.unchanged(
                format!(
                    "unable to traverse history. error: {}",
                    error["message"].as_str().ok_or_else(|| invalid("merge error message"))?,
                ),
                false,
            );
        }
        Ok(())
    }
    fn unrelated(&mut self, value: &Value) -> io::Result<()> {
        let strategy =
            value["strategy"].as_str().ok_or_else(|| invalid("merge unrelated strategy"))?;
        if !["ours", "theirs"].contains(&strategy) {
            return Err(invalid("unsupported unrelated strategy"));
        }
        let main = boolean(value, "hasMain")?;
        let local = if main { boolean(value, "hasResolvedLocally")? } else { strategy == "ours" };
        if unresolved(value, main, local)? {
            self.next("unrelatedFailure");
            return Ok(());
        }
        self.success("unrelated");
        if let Some(result) = self.result.as_mut() {
            result["unrelated"] = unrelated_result(strategy, local, main);
        }
        Ok(())
    }
}
impl State {
    pub(super) fn begin(&mut self, input: Value, owner: &journal::State) -> io::Result<Value> {
        let identity: Identity = serde_json::from_value(input).map_err(io::Error::other)?;
        owner.verify(&identity.token, identity.index)?;
        if self.records.len() >= 4096
            || identity.id.len() > 4096
            || identity.id_without_version.len() > 4096
        {
            return Err(invalid("merge status bounds"));
        }
        self.sequence =
            self.sequence.checked_add(1).ok_or_else(|| invalid("merge status token overflow"))?;
        let token =
            crate::validate::hexadecimal(&Sha1::digest(format!("merge-status:{}", self.sequence)));
        let cursor = Cursor {
            identity,
            revision: 0,
            observe: "model".to_owned(),
            selector: "none",
            removed: Removed::default(),
            target_only: false,
            result: None,
        };
        let output = cursor.output(&token);
        self.records.insert(token, cursor);
        Ok(output)
    }
    pub(super) fn receipt(&mut self, input: Value, owner: &journal::State) -> io::Result<Value> {
        let request: Receipt = serde_json::from_value(input).map_err(io::Error::other)?;
        let mut cursor = self.records
            .get(&request.token)
            .cloned()
            .ok_or_else(|| invalid("stale merge status"))?;
        owner.verify(&cursor.identity.token, cursor.identity.index)?;
        if cursor.revision != request.revision
            || cursor.observe != request.observe
            || cursor.result.is_some()
        {
            return Err(invalid("stale merge status receipt"));
        }
        cursor.transition(&request.value)?;
        cursor.revision = cursor.revision
            .checked_add(1)
            .ok_or_else(|| invalid("merge status revision overflow"))?;
        let output = cursor.output(&request.token);
        self.records.insert(request.token, cursor);
        Ok(output)
    }
    pub(super) fn finish(&mut self, tokens: &[String]) {
        self.records.retain(|_, cursor| !tokens.contains(&cursor.identity.token));
    }
}

fn current_selector(value: &Value, lane: bool) -> io::Result<&'static str> {
    if boolean(value, "bitmapPresent")? {
        Ok("bitmap")
    } else if boolean(value, "currentLanePresent")? {
        Ok(if lane { "lane" } else { "none" })
    } else {
        Ok("main")
    }
}
fn unresolved(value: &Value, main: bool, local: bool) -> io::Result<bool> {
    Ok(main && !local && !boolean(value, "hasResolvedRemotely")?)
}

fn already_merged(value: &Value) -> io::Result<bool> {
    Ok(!boolean(value, "diverged")?
        && (boolean(value, "sourceAhead")? || !boolean(value, "targetAhead")?))
}
fn unrelated_result(strategy: &str, local: bool, main: bool) -> Value {
    json!({"strategy":strategy,"head":if local {"current"}else {"other"},"unrelatedHead":if local {"other"}else {"current"},"lane":if main || strategy=="theirs" {"current"}else {"other"}})
}
