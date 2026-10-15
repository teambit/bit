//! When a merge changes a component's configuration, the engine asks for the
//! built-in Node environment's defaults and, for the merged files, a fresh
//! dependency detection, before it plans the merged metadata.

use super::{Steps, defaults};
use crate::commands::status::{
    capture::{self, Capture},
    fresh::{Detection, Facts, Pending},
    grammar,
    js::{array, decline, object, text, truthy},
    policy::{self, Policy},
};
use serde_json::{Value, json};
use std::io;

/// What the policy steps add to the plan.
pub struct Prepared {
    pub plan: Value,
    /// `dependencyCaches`: the cache entries of the merged versions.
    pub caches: Vec<Pending>,
}

impl Steps<'_> {
    /// The command policy of the prepared plan and its dependency states.
    pub(super) fn prepare_policy(
        &mut self,
        mut plan: Value,
        capture: &Capture,
    ) -> io::Result<Prepared> {
        let original = original_context(self.context)?;
        let rows = targets(&plan["policyPreparation"]["targets"], &original)?;
        let components = rows
            .iter()
            .map(|row| policy_component(row, &original, capture))
            .collect::<io::Result<Vec<_>>>()?;
        let policy_plan: Value = self.engine.request(&json!({
            "kind": "commandPolicyPrepare",
            "token": self.token,
            "components": components,
        }))?;
        self.check_token(&policy_plan, "command configuration receipt")?;
        let Some(preparation) = policy_plan
            .get("dependencyPreparation")
            .filter(|value| truthy(Some(value)))
            .cloned()
        else {
            capture::spread(&mut plan, &policy_plan)?;
            return Ok(Prepared { plan, caches: Vec::new() });
        };
        let completed = self.dependencies(&preparation, &original, &rows)?;
        let caches = array(completed.get("dependencyCaches"), "dependency caches")?
            .iter()
            .map(Pending::from_cache)
            .collect::<io::Result<Vec<_>>>()?;
        capture::spread(&mut plan, &completed)?;
        Ok(Prepared { plan, caches })
    }

    /// `commandDependencyDetect` and `commandDependencyComplete` for the
    /// projected targets.
    fn dependencies(
        &mut self,
        preparation: &Value,
        original: &Value,
        rows: &[Value],
    ) -> io::Result<Value> {
        let context = &preparation["context"];
        let projected = targets(&preparation["targets"], original)?;
        let inputs = projected
            .iter()
            .map(|target| Input::new(context, target))
            .collect::<io::Result<Vec<_>>>()?;
        let captures = self.detect(context, &projected, &inputs)?;
        let completed: Value = self.engine.request(&json!({
            "kind": "commandDependencyComplete",
            "token": self.token,
            "components": completions(&projected, &inputs, &captures)?,
        }))?;
        self.check_token(&completed, "command dependency completion receipt")?;
        validate(&completed, &projected, rows)?;
        Ok(completed)
    }

    /// `commandDependencyDetect`: the engine's capture of each projected target.
    fn detect(
        &mut self,
        context: &Value,
        projected: &[Value],
        inputs: &[Input],
    ) -> io::Result<Vec<Value>> {
        let facts = Facts::new(self.home)?;
        let detection = Detection { root: self.root, context, facts: &facts };
        let components = projected
            .iter()
            .zip(inputs)
            .map(|(target, input)| {
                let detected = detection.detection(&input.files, &input.policy)?;
                Ok(json!({ "identity": target["identity"], "detection": detected }))
            })
            .collect::<io::Result<Vec<_>>>()?;
        let detected: Value = self.engine.request(&json!({
            "kind": "commandDependencyDetect",
            "token": self.token,
            "components": components,
        }))?;
        let captures = detected.get("components").and_then(Value::as_array);
        match captures {
            Some(captures)
                if detected.get("token").and_then(Value::as_str) == Some(self.token)
                    && captures.len() == inputs.len() =>
            {
                Ok(captures.clone())
            }
            _ => Err(decline("command detected dependency receipt")),
        }
    }

    fn check_token(&self, receipt: &Value, what: &str) -> io::Result<()> {
        if receipt.get("token").and_then(Value::as_str) == Some(self.token) {
            Ok(())
        } else {
            Err(decline(what))
        }
    }
}

/// A projected target's policy, files and environment defaults.
struct Input {
    policy: Policy,
    files: Vec<String>,
    default_node: Value,
}

impl Input {
    fn new(context: &Value, target: &Value) -> io::Result<Self> {
        let policy = policy::projected_policy(context, target, target.get("projectedVersion"))?;
        let files = files(target)?;
        let default_node = defaults::receipt(target, &policy, &files)?;
        Ok(Self { policy, files, default_node })
    }
}

/// The context with the lane's inactive and added targets.
fn original_context(context: &Value) -> io::Result<Value> {
    let mut original = context.clone();
    let mut all = array(context.get("targets"), "targets")?.to_vec();
    for field in ["inactiveTargets", "addedTargets"] {
        if let Some(extra) = context["lane"]
            .get(field)
            .filter(|extra| !extra.is_null())
        {
            all.extend(array(Some(extra), "lane targets")?.iter().cloned());
        }
    }
    original["targets"] = Value::Array(all);
    Ok(original)
}

/// `targets(value, context)`: distinct targets of the context, with files.
fn targets(value: &Value, context: &Value) -> io::Result<Vec<Value>> {
    let originals = array(context.get("targets"), "targets")?;
    let rows = value
        .as_array()
        .filter(|rows| !rows.is_empty() && rows.len() <= originals.len());
    let rows = rows.ok_or_else(|| decline("command dependency target receipt"))?;
    let mut seen = Vec::new();
    for row in rows {
        let identity = row.get("identity").and_then(Value::as_str);
        let known = originals
            .iter()
            .any(|original| {
                original.get("identity").and_then(Value::as_str) == identity
                    && original.get("directory") == row.get("directory")
            });
        let files = row.get("files").and_then(Value::as_array);
        let files_ok =
            files.is_some_and(|files| files.len() <= 4096 && files.iter().all(Value::is_string));
        if identity.is_none() || seen.contains(&identity) || !known || !files_ok {
            return Err(decline("command dependency target receipt"));
        }
        seen.push(identity);
    }
    Ok(rows.clone())
}

fn files(row: &Value) -> io::Result<Vec<String>> {
    array(row.get("files"), "target files")?
        .iter()
        .map(|file| text(Some(file)).map(str::to_string))
        .collect()
}

/// One `commandPolicyPrepare` component.
fn policy_component(row: &Value, original: &Value, capture: &Capture) -> io::Result<Value> {
    let identity = text(row.get("identity"))?;
    let fast_forward = truthy(row.get("fastForward"));
    let added = original["lane"]["addedTargets"]
        .as_array()
        .is_some_and(|added| {
            added
                .iter()
                .any(|target| target.get("identity").and_then(Value::as_str) == Some(identity))
        });
    if added && !fast_forward {
        return Err(decline("command new component policy requires incoming projection"));
    }
    let target = array(original.get("targets"), "targets")?
        .iter()
        .find(|target| target.get("identity").and_then(Value::as_str) == Some(identity))
        .ok_or_else(|| decline("command policy target"))?;
    let projected = if fast_forward { row.get("otherVersion") } else { None };
    let policy = policy::projected_policy(original, target, projected)?;
    let default_node = defaults::receipt(target, &policy, &files(row)?)?;
    let semver = grammar::config_inputs(&json!([row, default_node]))
        .ok_or_else(|| decline("command configuration grammar"))?;
    let mut component =
        json!({ "identity": identity, "defaultNode": default_node, "semver": semver });
    let state = capture.dependency_states.get(identity).filter(|_| !fast_forward);
    if let Some(state) = state.filter(|state| !state.is_null()) {
        component["dependencyState"] = state.clone();
    }
    Ok(component)
}

/// The `commandDependencyComplete` components: the policy input with the
/// dependency grammar of the detected strings.
fn completions(
    projected: &[Value],
    inputs: &[Input],
    captures: &[Value],
) -> io::Result<Vec<Value>> {
    projected
        .iter()
        .zip(inputs)
        .zip(captures)
        .map(|((target, input), detected)| {
            let (policy, default_node) = (&input.policy, &input.default_node);
            if detected.get("identity") != target.get("identity") {
                return Err(decline("command dependency capture order"));
            }
            let mut component =
                json!({ "identity": target["identity"], "defaultNode": default_node });
            for (key, value) in object(&policy.input)? {
                component[key] = value.clone();
            }
            let grammar_inputs = detected
                .get("grammarInputs")
                .cloned()
                .unwrap_or(Value::Null);
            component["resolution"]["grammar"] =
                grammar::dependency(&json!([policy.input, grammar_inputs]));
            Ok(component)
        })
        .collect()
}

/// `validateCaches` and `validateIssueTargets`.
fn validate(completed: &Value, projected: &[Value], rows: &[Value]) -> io::Result<()> {
    let cache_targets: Vec<&Value> = if completed.get("snapFailed") == Some(&Value::Bool(true)) {
        projected
            .iter()
            .filter(|target| {
                rows.iter()
                    .any(|row| {
                        row.get("identity") == target.get("identity")
                            && !truthy(row.get("fastForward"))
                    })
            })
            .collect()
    } else {
        projected.iter().collect()
    };
    let caches = completed.get("dependencyCaches").and_then(Value::as_array);
    let caches = caches.filter(|caches| caches.len() == cache_targets.len());
    let caches = caches.ok_or_else(|| decline("command dependency cache receipt"))?;
    for (cache, target) in caches.iter().zip(&cache_targets) {
        if cache.get("identity").and_then(Value::as_str) != Some(versioned(target).as_str()) {
            return Err(decline("command dependency cache receipt"));
        }
    }
    let issues = completed.get("issueTargets").and_then(Value::as_array);
    let issues = issues.filter(|issues| issues.len() == projected.len());
    let issues = issues.ok_or_else(|| decline("command issue target receipt"))?;
    for (component, target) in issues.iter().zip(projected) {
        let valid = component.get("identity").and_then(Value::as_str)
            == Some(versioned(target).as_str())
            && component.get("packageName").is_some_and(Value::is_string)
            && component["dependencies"]
                .as_array()
                .is_some_and(|ids| ids.iter().all(Value::is_string))
            && component.get("issues").is_some_and(Value::is_array);
        if !valid {
            return Err(decline("command issue target receipt"));
        }
    }
    Ok(())
}

/// `` `${target.identity}@${target.version}` ``.
fn versioned(target: &Value) -> String {
    let identity = target
        .get("identity")
        .and_then(Value::as_str)
        .unwrap_or("undefined");
    let version = target
        .get("version")
        .and_then(Value::as_str)
        .unwrap_or("undefined");
    format!("{identity}@{version}")
}
