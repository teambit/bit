//! Semver grammar for the engine-owned workspace policy update after checkout.
use super::{Steps, array, decline, text};
use crate::commands::status::grammar;
use serde_json::{Value, json};
use std::io;

impl Steps<'_> {
    pub(super) fn checkout_policy(&mut self, plan: &mut Value) -> io::Result<()> {
        let Some(receipt) = plan.get("checkoutPolicyPreparation") else { return Ok(()) };
        let mut inputs = vec![receipt.clone()];
        let dependencies = array(receipt.get("componentDeps"), "checkout policy dependencies")?;
        for entry in array(receipt.get("workspaceEntries"), "checkout workspace entries")? {
            inputs.extend(prefixed_ranges(entry, dependencies)?);
        }
        let semver = grammar::config_inputs(&json!(inputs))
            .ok_or_else(|| decline("checkout policy semver grammar"))?;
        let completed: Value = self.engine.request(
            &json!({"kind":"commandCheckoutPolicyComplete","token":self.token,"semver":semver}),
        )?;
        if completed["token"] != self.token {
            return Err(decline("checkout policy owner token"));
        }
        plan["result"] = completed["result"].clone();
        Ok(())
    }
}

fn prefixed_ranges(entry: &Value, dependencies: &[Value]) -> io::Result<Vec<Value>> {
    let version = text(entry["value"].get("version"))?;
    let Some(prefix) = version.chars().next() else { return Ok(Vec::new()) };
    let mut inputs = Vec::new();
    for dependency in dependencies
        .iter()
        .filter(|dependency| dependency["name"] == entry["dependencyId"])
    {
        for value in array(dependency.get("versions"), "checkout policy versions")? {
            inputs.push(json!(format!("{prefix}{}", text(Some(value))?)));
        }
    }
    Ok(inputs)
}
