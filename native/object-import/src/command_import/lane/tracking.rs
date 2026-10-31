//! A fetched switch adds a local alias only when that remote lane is not already tracked.
use super::{Entry, Id, PreparedImport, Record, invalid, text};
use serde_json::{Value, json};
use std::{fs, io, path::PathBuf};

pub(crate) struct SwitchTracking {
    path: PathBuf,
    before: Vec<u8>,
    after: Vec<u8>,
}
impl SwitchTracking {
    pub(crate) fn validate(&self) -> io::Result<()> {
        if read(&self.path)? != self.before {
            return Err(invalid("switch tracking configuration changed"));
        }
        Ok(())
    }
    pub(crate) fn commit(&self) -> io::Result<Value> {
        self.validate()?;
        super::super::publish::write_file(&self.path, &self.after)?;
        if read(&self.path)? != self.after {
            return Err(invalid("switch tracking publication changed"));
        }
        Ok(super::super::write_receipt(&self.path, Some(&self.before), &self.after))
    }
}

impl PreparedImport {
    pub(crate) fn resolve_switch_lane(
        &mut self,
        id: &Id,
        skip_fetch: bool,
    ) -> io::Result<Option<Record>> {
        let local = self.load_lane(id)?;
        if !id.is_main() && skip_fetch && local.is_none() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!(
                    r#"unable to switch to lane "{}/{}" with --skip-fetch: the lane doesn't exist in the local scope. run without --skip-fetch to fetch it from the remote."#,
                    id.scope, id.name,
                ),
            ));
        }
        match self.resolve_other_lane_with_policy(id, skip_fetch, true) {
            Err(error) if local.is_some() && error.kind() == io::ErrorKind::NotFound => {
                self.writes.switch_warning = Some(format!(
                    r#"failed to fetch lane "{}/{}" from the remote, falling back to local state. {}
use --skip-fetch to skip this step."#,
                    id.scope, id.name, error,
                ));
                Ok(local)
            }
            result => result,
        }
    }

    pub(crate) fn defer_switch_tracking(&mut self) -> io::Result<Option<SwitchTracking>> {
        let Some(after) = self.writes.switch_tracking.take() else { return Ok(None) };
        let path = self.environment.local_directory
            .parent()
            .ok_or_else(|| invalid("switch scope directory"))?
            .join("scope.json");
        let before = self.capture
            .read(&path)?
            .ok_or_else(|| invalid("switch scope configuration missing"))?;
        Ok(Some(SwitchTracking { path, before, after }))
    }

    pub(crate) fn stage_switch_tracking_alias(
        &mut self,
        id: &Id,
        alias: Option<&str>,
    ) -> io::Result<()> {
        id.validate()?;
        if id.is_main() {
            return Ok(());
        }
        let path = self.environment.local_directory
            .parent()
            .ok_or_else(|| invalid("switch scope directory"))?
            .join("scope.json");
        let mut scope = self.capture
            .json(&path)?
            .ok_or_else(|| invalid("switch scope configuration missing"))?;
        if scope.get("lanes").is_none() {
            scope["lanes"] = json!({"current":"main","tracking":[],"new":[]});
        }
        if append(
            &mut scope,
            id,
            alias
                .filter(|alias| !alias.is_empty())
                .unwrap_or(&id.name),
        )? {
            self.writes.switch_tracking = Some(bit_workspace_config::render_scope_json(&scope)?);
        }
        Ok(())
    }
}
fn read(path: &std::path::Path) -> io::Result<Vec<u8>> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(invalid("switch tracking file shape"));
    }
    crate::read_budget::Budget::new(32 * 1024 * 1024).read(fs::File::open(path)?)
}
fn append(scope: &mut Value, id: &Id, alias: &str) -> io::Result<bool> {
    let tracking = scope["lanes"]["tracking"]
        .as_array_mut()
        .ok_or_else(|| invalid("switch lane tracking configuration"))?;
    if tracking.len() >= 4096 {
        return Err(invalid("switch lane tracking budget"));
    }
    if tracking
        .iter()
        .any(|row| row["remoteLane"] == id.name && row["remoteScope"] == id.scope)
    {
        return Ok(false);
    }
    if let Some(row) = tracking
        .iter_mut()
        .find(|row| row["localLane"] == alias)
    {
        row["remoteLane"] = json!(id.name);
        row["remoteScope"] = json!(id.scope);
    } else {
        tracking.push(json!({"localLane":alias,"remoteLane":id.name,"remoteScope":id.scope}));
    }
    Ok(true)
}

pub(crate) fn parse_lane_id(value: &Value) -> io::Result<Id> {
    if let Some(raw) = value.as_str() {
        let raw = raw.trim();
        let raw = raw.split('@').next().unwrap_or(raw);
        let (scope, name) = raw.split_once('/').ok_or_else(|| invalid("command lane identity"))?;
        return Ok(Id { scope: scope.trim().into(), name: name.trim().into() });
    }
    Ok(Id { scope: text(value, "scope")?.trim().into(), name: text(value, "name")?.trim().into() })
}

pub(crate) fn lane_index_id(row: &Value) -> io::Result<Id> {
    parse_lane_id(&row["id"])
}

pub(super) fn hidden_entry(row: &Value, default_scope: Option<&str>) -> io::Result<Entry> {
    if let Some(raw) = row.as_str() {
        let (identity, head) =
            raw.rsplit_once('@').ok_or_else(|| invalid("command hidden lane identity"))?;
        let identity =
            component_identity_with_scope(&Value::String(identity.into()), default_scope)?;
        crate::merge_history::hash(head)?;
        return Ok(Entry { identity, head: head.to_owned(), hidden: true });
    }
    let id_node = row.get("id").unwrap_or(row);
    let identity = component_identity_with_scope(id_node, default_scope)?;
    let head = row["head"]
        .as_str()
        .or_else(|| row["version"].as_str())
        .ok_or_else(|| invalid("command hidden lane identity"))?;
    crate::merge_history::hash(head)?;
    Ok(Entry { identity, head: head.to_owned(), hidden: true })
}

pub(super) fn component_identity_with_scope(
    value: &Value,
    default_scope: Option<&str>,
) -> io::Result<String> {
    let (scope, name) = split_component_scope_and_name(value, default_scope)?;
    if scope.is_empty()
        || scope.len() > 1024
        || matches!(scope, "." | "..")
        || !scope
            .bytes()
            .all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"._-".contains(&byte)
            })
    {
        return Err(invalid("command lane component scope"));
    }
    if !valid_lane_component_name(name) {
        return Err(invalid("command lane component identity"));
    }
    Ok(format!("{scope}/{name}"))
}

fn split_component_scope_and_name<'a>(
    value: &'a Value,
    default_scope: Option<&'a str>,
) -> io::Result<(&'a str, &'a str)> {
    if let Some(raw) = value.as_str() {
        let base = raw.split('@').next().unwrap_or(raw);
        return match base.split_once('/') {
            Some((scope, name)) => Ok((scope, name)),
            None => {
                Ok((default_scope.ok_or_else(|| invalid("command lane component scope"))?, base))
            }
        };
    }
    let scope = value["scope"]
        .as_str()
        .filter(|val| !val.is_empty())
        .or(default_scope)
        .ok_or_else(|| invalid("command lane string field"))?;
    Ok((scope, text(value, "name")?))
}

fn valid_lane_component_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 4096
        && name
            .split('/')
            .all(|part| {
                !part.is_empty()
                    && !matches!(part, "." | "..")
                    && part
                        .bytes()
                        .all(|byte| {
                            byte.is_ascii_lowercase()
                                || byte.is_ascii_digit()
                                || b"._-".contains(&byte)
                        })
            })
}

#[cfg(test)]
mod tests;
