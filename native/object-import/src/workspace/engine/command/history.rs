use super::{
    super::{invalid, status_history},
    repository::Repository,
};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
    path::Path,
};

#[derive(Default, Clone)]
pub(super) struct State {
    values: HashMap<String, Value>,
    changed: HashSet<String>,
}
impl State {
    pub(super) fn distance(
        &mut self,
        root: &Path,
        identity: &str,
        model: &Value,
        heads: [Option<&str>; 2],
        repository: &mut Repository,
    ) -> io::Result<Value> {
        if heads[0] == heads[1] {
            return Ok(json!({"sourceOnly":[],"targetOnly":[],"noCommon":false}));
        }
        self.load(identity, model, repository)?;
        let history = self.values.get_mut(identity).ok_or_else(|| invalid("command history"))?;
        for head in heads.into_iter().flatten() {
            if populate(root, history, head, repository)? {
                self.changed.insert(identity.to_owned());
            }
        }
        crate::merge_history::status::distance(&history["versions"], heads[0], heads[1])
    }
    fn load(
        &mut self,
        identity: &str,
        model: &Value,
        repository: &mut Repository,
    ) -> io::Result<()> {
        if self.values.contains_key(identity) {
            return Ok(());
        }
        let value = match repository.read(&status_history::identity(identity), "VersionHistory") {
            Ok(value) => value,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                json!({"name":model["name"],"scope":model["scope"],"versions":[],"graphCompleteRefs":[]})
            }
            Err(error) => return Err(error),
        };
        if value["name"] != model["name"] || value["scope"] != model["scope"] {
            return Err(invalid("command history identity"));
        }
        self.values.insert(identity.to_owned(), value);
        Ok(())
    }
    pub(super) fn rebase(&mut self, versions: &[(String, String, Value)]) -> io::Result<()> {
        for (identity, hash, version) in versions {
            let identity = identity.trim();
            let hash = hash.trim();
            let Some(history) = self.values.get_mut(identity) else {
                continue;
            };
            let rows = history["versions"]
                .as_array_mut()
                .ok_or_else(|| invalid("command history versions"))?;
            if let Some(row) = rows
                .iter_mut()
                .find(|row| row["hash"].as_str().map(str::trim) == Some(hash))
            {
                apply_rebased_version(row, version);
                self.changed.insert(identity.to_owned());
            }
        }
        Ok(())
    }
    pub(super) fn commit(&self, root: &Path) -> io::Result<()> {
        let plans = self.changed
            .iter()
            .map(|identity| {
                json!({
                    "identity":identity,"history":self.values[identity],"readSet":[],
                })
            })
            .collect::<Vec<_>>();
        let input =
            serde_json::from_value(json!({"root":root,"plans":plans})).map_err(io::Error::other)?;
        status_history::commit(&input)?;
        Ok(())
    }
}
fn existing_hashes(history: &Value) -> io::Result<HashSet<String>> {
    history["versions"]
        .as_array()
        .ok_or_else(|| invalid("command history records"))?
        .iter()
        .map(|row| {
            row["hash"]
                .as_str()
                .map(str::trim)
                .filter(|hash| !hash.is_empty())
                .map(str::to_owned)
                .ok_or_else(|| invalid("command history reference"))
        })
        .collect()
}

pub(super) fn populate(
    root: &Path,
    history: &mut Value,
    head: &str,
    repository: &mut Repository,
) -> io::Result<bool> {
    let head = head.trim();
    let existing = existing_hashes(history)?;
    if existing.contains(head) {
        return Ok(false);
    }
    let overlays = ancestors(head, &existing, repository)?;
    let head_data = overlays
        .iter()
        .find(|value| value["hash"] == head)
        .ok_or_else(|| invalid("command history head"))?;
    let result = crate::history_query::populate::begin(json!({
        "objectsDirectory":crate::scope_path(root).join("objects"),"head":head,"headExists":false,"exitWhenFind":true,
        "existing":existing,"headData":head_data,"overlays":overlays,
    }))?;
    if result["complete"] != true {
        return Err(invalid("command history incomplete"));
    }
    let added = result["added"].as_array().ok_or_else(|| invalid("command history population"))?;
    let rows =
        history["versions"].as_array_mut().ok_or_else(|| invalid("command history records"))?;
    for row in added {
        let mut record = json!({"hash":row["hash"],"parents":row["parents"]});
        for key in ["unrelated", "squashed"] {
            if let Some(value) = row.get(key) {
                record[key] = value.clone();
            }
        }
        rows.push(record);
    }
    Ok(true)
}
fn ancestors(
    head: &str,
    existing: &HashSet<String>,
    repository: &mut Repository,
) -> io::Result<Vec<Value>> {
    let mut pending = vec![head.to_owned()];
    let mut seen = existing.clone();
    let mut output = Vec::new();
    while let Some(reference) = pending.pop() {
        if !seen.insert(reference.clone()) {
            continue;
        }
        if seen.len() > 4096 {
            return Err(invalid("command history limit"));
        }
        let mut version = repository.read(&reference, "Version")?;
        crate::read_version::parents(&version)?;
        if let Some(parents) = version["parents"].as_array() {
            pending.extend(
                parents
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::trim)
                    .filter(|parent| !parent.is_empty())
                    .map(str::to_owned),
            );
        }
        version["hash"] = json!(reference);
        output.push(version);
    }
    Ok(output)
}

fn apply_rebased_version(row: &mut Value, version: &Value) {
    row["parents"] = version["parents"].clone();
    row["squashed"] = version["squashed"]["previousParents"].clone();
    if version["unrelated"].is_null() {
        if let Some(object) = row.as_object_mut() {
            object.remove("unrelated");
        }
    } else {
        row["unrelated"] = version["unrelated"]["head"].clone();
    }
}
