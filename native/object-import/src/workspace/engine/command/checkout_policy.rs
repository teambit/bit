//! Inputs for `ConfigMergerMain.updateDepsInWorkspaceConfig` after checkout.

mod publication;

use super::{State, invalid, materialization};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{io, path::Path};

const RESOLVER: &str = "teambit.dependencies/dependency-resolver";

pub(super) struct Prepared {
    input: Value,
    publication: publication::Prepared,
    ready: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Complete {
    token: String,
    semver: Value,
}

impl Prepared {
    pub(super) fn new(root: &Path, receipt: Value) -> io::Result<Self> {
        let publication = publication::Prepared::new(root.join("workspace.jsonc"))?;
        Ok(Self { input: receipt, publication, ready: false })
    }

    pub(super) fn merged(root: &Path, plan: &Value) -> io::Result<Self> {
        let mut prepared = Self::new(root, Value::Null)?;
        prepared.publication.prepare(&json!({"updates":plan["updates"],
            "conflicts":plan["conflicts"],"logs":[],"hasDeps":true,"merge":true}))?;
        prepared.ready = true;
        Ok(prepared)
    }

    pub(super) fn finish(&mut self, semver: Value) -> io::Result<Option<Value>> {
        if self.ready {
            return Err(invalid("command checkout policy already complete"));
        }
        let mut request = self.input.clone();
        request["semver"] = semver;
        let updates = crate::config_merge::apply("configWorkspaceUpdates", &request)?;
        let report = self.publication.prepare(&updates)?;
        self.ready = true;
        self.validate()?;
        Ok(report)
    }

    pub(super) fn validate(&self) -> io::Result<()> {
        if !self.ready {
            return Err(invalid("command checkout policy incomplete"));
        }
        self.publication.validate()
    }

    pub(super) fn commit(&self) -> io::Result<()> {
        self.publication.commit()
    }
}

pub(in crate::workspace::engine) fn complete(
    input: Complete,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let mut record = state.record.take().ok_or_else(|| invalid("command policy owner absent"))?;
    if record.token != input.token.trim() {
        return Err(invalid("command policy token"));
    }
    let mut planned = record.planned.take().ok_or_else(|| invalid("command policy plan absent"))?;
    let policy = planned.checkout_policy
        .as_mut()
        .ok_or_else(|| invalid("command checkout policy preparation absent"))?;
    if policy.ready {
        return Err(invalid("command checkout policy already complete"));
    }
    let mut request = policy.input.clone();
    request["semver"] = input.semver;
    let updates = crate::config_merge::apply("configWorkspaceUpdates", &request)?;
    let report = policy.publication.prepare(&updates)?;
    policy.ready = true;
    if let Some(report) = report {
        planned.plan.result["workspaceConfigUpdateResult"] = report;
    }
    policy.validate()?;
    super::proof::verify(&record.proofs)?;
    let count = planned.plan.result["components"].as_array().map_or(0, Vec::len);
    let output = json!({"token":record.token,"result":planned.plan.result});
    record.planned = Some(planned);
    state.record = Some(record);
    Ok((count, output))
}

pub(super) fn receipt(
    context: &Value,
    materials: &[materialization::Prepared],
    strategy: Option<&str>,
) -> io::Result<Option<Value>> {
    receipt_versions(
        context,
        materials
            .iter()
            .map(|material| (&material.version, material.keep_ours)),
        strategy,
    )
}

pub(super) fn receipt_versions<'a>(
    context: &Value,
    materials: impl IntoIterator<Item = (&'a Value, bool)>,
    strategy: Option<&str>,
) -> io::Result<Option<Value>> {
    if strategy == Some("ours") {
        return Ok(None);
    }
    let policy = context["workspace"]
        .as_object()
        .and_then(|ws| {
            ws.iter()
                .find(|(key, _)| {
                    key.as_str() == RESOLVER || key.starts_with(&format!("{RESOLVER}@"))
                })
                .and_then(|(_, val)| val["policy"].as_object())
        });
    let Some(policy) = policy else { return Ok(None) };
    let entries = workspace_entries(policy)?;
    if entries.is_empty() {
        return Ok(None);
    }
    let groups = component_versions(materials, &entries);
    if groups.is_empty() {
        return Ok(None);
    }
    let component_deps = groups
        .into_iter()
        .map(|(name, versions)| json!({"name":name,"versions":versions}))
        .collect::<Vec<_>>();
    Ok(Some(json!({"workspaceEntries":entries,"componentDeps":component_deps,
        "strategy":strategy})))
}

fn component_versions<'a>(
    materials: impl IntoIterator<Item = (&'a Value, bool)>,
    entries: &[Value],
) -> Vec<(String, Vec<String>)> {
    let mut groups = Vec::new();
    for (version, keep_ours) in materials {
        if keep_ours {
            continue;
        }
        let resolver = version["extensions"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|row| {
                crate::workspace::engine::client_status::config::is_extension_aspect(row, RESOLVER)
                    || row["extensionId"]["name"]
                        .as_str()
                        .or_else(|| row["extensionId"].as_str())
                        .is_some_and(|name| {
                            name == RESOLVER || name.starts_with(&format!("{RESOLVER}@"))
                        })
            });
        let Some(dependencies) = resolver.and_then(|row| row["data"]["dependencies"].as_array())
        else {
            continue;
        };
        for dependency in dependencies {
            let Some((name, version)) = selected_dependency(dependency, entries) else {
                continue;
            };
            insert_version(&mut groups, name, version);
        }
    }
    groups
}

fn selected_dependency<'a>(dependency: &'a Value, entries: &[Value]) -> Option<(&'a str, &'a str)> {
    if dependency["source"] != "auto" || dependency["hidden"] == true {
        return None;
    }
    let name = dependency["packageName"]
        .as_str()
        .or_else(|| {
            (dependency["__type"] == "package")
                .then(|| dependency["id"].as_str())
                .flatten()
        })
        .map(str::trim)
        .filter(|name| !name.is_empty())?;
    let version = dependency["version"]
        .as_str()
        .map(str::trim)
        .filter(|version| !version.is_empty())?;
    entries
        .iter()
        .any(|entry| entry["dependencyId"] == name && entry["value"]["version"] != version)
        .then_some((name, version))
}

fn insert_version(groups: &mut Vec<(String, Vec<String>)>, name: &str, version: &str) {
    if let Some((_, versions)) = groups
        .iter_mut()
        .find(|(found, _)| found == name)
    {
        if !versions
            .iter()
            .any(|found| found == version)
        {
            versions.push(version.to_owned());
        }
    } else {
        groups.push((name.to_owned(), vec![version.to_owned()]));
    }
}

fn workspace_entries(policy: &serde_json::Map<String, Value>) -> io::Result<Vec<Value>> {
    let mut entries = Vec::new();
    for field in ["dependencies", "devDependencies", "peerDependencies"] {
        let Some(dependencies) = policy.get(field).and_then(Value::as_object) else {
            continue;
        };
        for (name, value) in dependencies {
            entries.push(policy_entry(field, name, value)?);
        }
    }
    Ok(entries)
}

fn policy_entry(field: &str, name: &str, value: &Value) -> io::Result<Value> {
    let name = name.trim();
    let version = value
        .as_str()
        .or_else(|| value["version"].as_str())
        .map(str::trim)
        .filter(|version| !name.is_empty() && !version.is_empty())
        .ok_or_else(|| invalid("command workspace policy entry"))?;
    let lifecycle = if field == "peerDependencies" { "peer" } else { "runtime" };
    Ok(json!({"dependencyId":name,"lifecycleType":lifecycle,"value":{"version":version}}))
}

#[cfg(test)]
mod tests;
