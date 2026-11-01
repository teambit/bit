//! Semver grammar for the engine-owned workspace policy update after checkout.
//!
//! Extends [`Steps`] with [`Steps::checkout_policy`] using [`grammar`] semver snapshots.
use super::{Steps, array, decline, text};
use crate::commands::status::grammar;
use serde_json::{Value, json};
use std::io;

impl Steps<'_> {
    #[inline]
    pub(super) fn checkout_policy(&mut self, plan: &mut Value) -> io::Result<()> {
        let Some(receipt) = plan.get("checkoutPolicyPreparation") else { return Ok(()) };
        let semver = semver(receipt)?;
        let completed: Value = self.engine.request(
            &json!({"kind":"commandCheckoutPolicyComplete","token":self.token,"semver":semver}),
        )?;
        if completed["token"].as_str().map(str::trim) != Some(self.token.trim()) {
            return Err(decline("checkout policy owner token"));
        }
        plan["result"] = completed["result"].clone();
        Ok(())
    }
}

#[inline]
pub(crate) fn semver(receipt: &Value) -> io::Result<Value> {
    let mut inputs = vec![receipt.clone()];
    let dependencies = array(receipt.get("componentDeps"), "checkout policy dependencies")?;
    for entry in array(receipt.get("workspaceEntries"), "checkout workspace entries")? {
        append_prefixed_ranges(entry, dependencies, &mut inputs)?;
    }
    grammar::config_inputs(&json!(inputs)).ok_or_else(|| decline("checkout policy semver grammar"))
}

fn append_prefixed_ranges(
    entry: &Value,
    dependencies: &[Value],
    inputs: &mut Vec<Value>,
) -> io::Result<()> {
    let version =
        [entry["value"]["version"].as_str(), entry["value"].as_str(), entry["version"].as_str()]
            .into_iter()
            .flatten()
            .map(str::trim)
            .find(|val| !val.is_empty())
            .ok_or_else(|| decline("checkout policy entry version"))?;
    let Some(prefix) = version.chars().next() else { return Ok(()) };
    let Some(target_name) = [entry["dependencyId"].as_str(), entry["name"].as_str()]
        .into_iter()
        .flatten()
        .map(str::trim)
        .find(|name| !name.is_empty())
    else {
        return Ok(());
    };
    for dependency in dependencies
        .iter()
        .filter(|dependency| {
            ["name", "id", "packageName"]
                .into_iter()
                .any(|key| dependency[key].as_str().map(str::trim) == Some(target_name))
        })
    {
        for value in array(dependency.get("versions"), "checkout policy versions")? {
            let ver = text(Some(value))?.trim();
            if !ver.is_empty() {
                inputs.push(json!(format!("{prefix}{ver}")));
            }
        }
    }
    Ok(())
}
