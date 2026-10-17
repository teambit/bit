use super::{
    super::{
        super::{invalid, semver},
        Engine,
    },
    append, field,
};
use serde_json::{Value, json};
use std::io;

pub(crate) struct State<'a, 'b> {
    pub engine: &'a mut Engine<'b>,
    pub configs: Vec<Option<Value>>,
    pub policies: Vec<Vec<Value>>,
    pub data: Vec<Vec<Value>>,
    pub merged: Value,
    pub conflicted: Value,
}
impl<'a, 'b> State<'a, 'b> {
    pub(super) fn new(
        engine: &'a mut Engine<'b>,
        current: usize,
        other: usize,
        base: Option<usize>,
    ) -> io::Result<Self> {
        let configs = vec![
            Some(engine.input["current"][current].clone()),
            Some(engine.input["other"][other].clone()),
            base.map(|index| engine.input["base"][index].clone()),
        ];
        let policies = configs
            .iter()
            .map(|entry| {
                policy(
                    &entry
                        .as_ref()
                        .map_or(&Value::Null, |entry| &entry["config"])["policy"],
                )
            })
            .collect::<io::Result<Vec<_>>>()?;
        let data = ["current", "other", "base"]
            .iter()
            .map(|side| dependencies(engine, side))
            .collect::<io::Result<Vec<_>>>()?;
        Ok(Self { engine, configs, policies, data, merged: json!({}), conflicted: json!({}) })
    }
    pub(super) fn same(&self, left: usize, right: usize) -> bool {
        self.configs[left]
            .as_ref()
            .map(|entry| &entry["configJson"])
            == self.configs[right]
                .as_ref()
                .map(|entry| &entry["configJson"])
    }
    pub(super) fn add_policy(&mut self, dep: &Value) -> io::Result<()> {
        let name = dep["dependencyId"].as_str().ok_or_else(|| invalid("policy name"))?;
        let version = dep["value"]["version"].as_str().ok_or_else(|| invalid("policy version"))?;
        if let Some(component) = self.component_for_package(name)
            && self.engine.local(
                component["id"].as_str().ok_or_else(|| invalid("component dependency"))?,
                Some(version),
            )?
        {
            return Ok(());
        }
        if self.current_satisfies(name, version, dep["force"] == true)? {
            return Ok(());
        }
        let lifecycle = dep["lifecycleType"].as_str().ok_or_else(|| invalid("policy lifecycle"))?;
        append(
            &mut self.merged,
            field(lifecycle)?,
            json!({"name":name,"version":version,"force":dep["force"]}),
        );
        Ok(())
    }
    fn current_satisfies(&self, name: &str, version: &str, force: bool) -> io::Result<bool> {
        if let Some(current) = self.data[0]
            .iter()
            .find(|entry| {
                if entry["__type"] == "package" {
                    entry["id"] == name
                } else {
                    entry["packageName"] == name
                }
            })
        {
            let current_version =
                current["version"].as_str().ok_or_else(|| invalid("data version"))?;
            if !force
                && (current_version == version
                    || (!hash(current_version)
                        && !hash(version)
                        && semver::satisfies(
                            &self.engine.input["semver"],
                            current_version,
                            version,
                        )?))
            {
                return Ok(true);
            }
        }
        Ok(false)
    }
    pub(super) fn add_data(&mut self, dep: &Value) -> io::Result<()> {
        let id = dep["id"].as_str().ok_or_else(|| invalid("data id"))?;
        if dep["__type"] == "component" && self.engine.local(id, dep["version"].as_str())? {
            return Ok(());
        }
        let lifecycle = dep["lifecycle"].as_str().ok_or_else(|| invalid("data lifecycle"))?;
        let field = field(lifecycle)?;
        if self.has(field, id) {
            return Ok(());
        }
        let name = if dep["__type"] == "component" {
            dep["packageName"].as_str().ok_or_else(|| invalid("component packageName"))?
        } else {
            id
        };
        append(&mut self.merged, field, json!({"name":name,"version":version(dep),"force":false}));
        Ok(())
    }
    pub(super) fn has(&self, field: &str, name: &str) -> bool {
        self.merged[field]
            .as_array()
            .is_some_and(|entries| {
                entries
                    .iter()
                    .any(|entry| entry["name"] == name)
            })
    }
    pub(super) fn component_for_package(&self, name: &str) -> Option<&Value> {
        let mut ids = Vec::new();
        for entry in self.data[0]
            .iter()
            .chain(self.data[1].iter())
            .filter(|entry| entry["source"] == "auto")
        {
            if ids.contains(&&entry["id"]) {
                continue;
            }
            ids.push(&entry["id"]);
            if entry["__type"] == "component" && entry["packageName"] == name {
                return Some(entry);
            }
        }
        None
    }
    pub(super) fn finish(self) {
        let merged = (!self.merged
            .as_object()
            .expect("merged policy")
            .is_empty())
        .then(|| json!({"policy":self.merged}));
        let conflict = (!self.conflicted
            .as_object()
            .expect("conflict policy")
            .is_empty())
        .then_some(self.conflicted);
        self.engine.meta("debug", "final mergedConfig", merged.as_ref());
        self.engine.meta("debug", "final conflict", conflict.as_ref());
        let mut row = json!({"id":"teambit.dependencies/dependency-resolver","deps":true});
        if let Some(merged) = merged {
            row["merged"] = json!({"value":merged});
        }
        if let Some(conflict) = conflict {
            row["conflict"] = json!({"kind":"deps","value":conflict});
        }
        self.engine.rows.push(row);
    }
}
pub(super) fn version(dep: &Value) -> &str {
    dep["policy"]
        .as_str()
        .filter(|value| !value.is_empty())
        .or_else(|| dep["version"].as_str())
        .unwrap_or("")
}
fn hash(text: &str) -> bool {
    (3..=40).contains(&text.len()) && text.bytes().all(|byte| byte.is_ascii_hexdigit())
}
fn dependencies(engine: &Engine<'_>, side: &str) -> io::Result<Vec<Value>> {
    let extension = engine.input[side]
        .as_array()
        .ok_or_else(|| invalid("extension list"))?
        .iter()
        .find(|entry| entry["name"] == "teambit.dependencies/dependency-resolver");
    let Some(extension) = extension else {
        return Ok(Vec::new());
    };
    let Some(entries) = extension["data"]["dependencies"].as_array() else {
        return Ok(Vec::new());
    };
    if entries.len() > 4096 {
        return Err(invalid("dependency budget"));
    }
    let mut result = Vec::new();
    for entry in entries {
        let dep = normalize_dependency(entry, &extension["data"]["policy"])?;
        result.push(dep);
    }
    Ok(result)
}
fn normalize_dependency(entry: &Value, policies: &Value) -> io::Result<Value> {
    let mut dep = entry.clone();
    let id = entry["id"].as_str().ok_or_else(|| invalid("dependency id"))?;
    let id = if dep["__type"] == "package" { id } else { id.split('@').next().unwrap_or("") };
    dep["id"] = json!(id);
    if dep["__type"] == "package" {
        dep.as_object_mut()
            .ok_or_else(|| invalid("dependency object"))?
            .shift_remove("policy");
    }
    if dep["__type"] != "package" {
        let existing = policies
            .as_array()
            .and_then(|policies| {
                policies
                    .iter()
                    .find(|policy| policy["dependencyId"] == id)
            });
        dep["policy"] = existing.map_or_else(
            || dep["version"].clone(),
            |policy| policy["value"]["version"].clone(),
        );
    }
    Ok(dep)
}

fn policy(input: &Value) -> io::Result<Vec<Value>> {
    let mut result = Vec::new();
    for (field, lifecycle) in
        [("dependencies", "runtime"), ("devDependencies", "dev"), ("peerDependencies", "peer")]
    {
        if input[field].is_null() {
            continue;
        }
        let entries = policy_entries(&input[field])?;
        for entry in entries {
            let name = entry["name"].as_str().ok_or_else(|| invalid("policy name"))?;
            let version = entry["version"]
                .as_str()
                .or_else(|| entry["version"]["version"].as_str())
                .ok_or_else(|| invalid("policy version"))?;
            if result
                .iter()
                .any(|existing: &Value| {
                    existing["dependencyId"] == name && existing["lifecycleType"] == lifecycle
                })
            {
                continue;
            }
            result.push(json!({"dependencyId":name,"value":{"version":version},"lifecycleType":lifecycle,"force":super::super::super::truthy(&entry["force"])}));
        }
    }
    Ok(result)
}

fn policy_entries(input: &Value) -> io::Result<Vec<Value>> {
    let entries = if let Some(entries) = input.as_array() {
        entries.clone()
    } else if let Some(entries) = input.as_object() {
        entries
            .iter()
            .map(|(name, value)| json!({"name":name,"version":value,"force":true}))
            .collect()
    } else {
        return Err(invalid("config policy"));
    };
    Ok(entries)
}
