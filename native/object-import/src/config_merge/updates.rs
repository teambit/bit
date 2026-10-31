use super::{array, invalid, semver, text};
use serde_json::{Value, json};
use std::{cmp::Ordering, io};

#[derive(Default)]
struct Plan {
    updates: Vec<Value>,
    conflicts: serde_json::Map<String, Value>,
    logs: Vec<String>,
    warnings: Vec<String>,
    has_deps: bool,
}
pub(super) fn plan(input: &Value) -> io::Result<Value> {
    let entries = array(input, "workspaceEntries")?;
    let dependencies = array(input, "componentDeps")?;
    let mut plan = Plan::default();
    for dependency in dependencies {
        let versions = array(dependency, "versions")?;
        if versions.len() != 1 {
            continue;
        }
        let name = text(dependency, "name")?.trim();
        let entry = entries
            .iter()
            .rev()
            .find(|entry| entry["dependencyId"].as_str().map(str::trim) == Some(name))
            .ok_or_else(|| invalid("missing workspace dep"))?;
        let workspace = text(&entry["value"], "version")?.trim();
        let component = versions[0]
            .as_str()
            .map(str::trim)
            .filter(|version| !version.is_empty())
            .ok_or_else(|| invalid("component version"))?;
        let lifecycle = entries
            .iter()
            .find(|entry| entry["dependencyId"] == name)
            .ok_or_else(|| invalid("missing workspace dep"))?;
        plan.has_deps = true;
        decide(&mut plan, input, name, workspace, component, lifecycle["lifecycleType"] == "peer")?;
    }
    Ok(
        json!({"updates":plan.updates,"conflicts":plan.conflicts,"logs":plan.logs,"warnings":plan.warnings,"hasDeps":plan.has_deps}),
    )
}
fn decide(
    plan: &mut Plan,
    input: &Value,
    name: &str,
    workspace: &str,
    component: &str,
    peer: bool,
) -> io::Result<()> {
    let semver = &input["semver"];
    let component_version = semver[component].get("version").is_some();
    let workspace_version = semver[workspace].get("version").is_some();
    if (!component_version && semver[component].get("range").is_none())
        || (!workspace_version && semver[workspace].get("range").is_none())
    {
        plan.skip(name, "probably a snap-hash");
        return Ok(());
    }
    match (component_version, workspace_version) {
        (true, true) => {
            if semver::greater(semver, component, workspace)? {
                plan.conflict(input, name, workspace, component, peer);
            } else {
                plan.skip(name, &format!("the workspace version {workspace} is greater than {component} from the component"));
            }
        }
        (false, false) => ranges(plan, semver, name, workspace, component)?,
        (true, false) => component_version_range(plan, input, name, workspace, component, peer)?,
        (false, true) => component_range_version(plan, input, name, workspace, component, peer)?,
    }
    Ok(())
}
fn ranges(
    plan: &mut Plan,
    semver: &Value,
    name: &str,
    workspace: &str,
    component: &str,
) -> io::Result<()> {
    let component_minimum = semver[component].get("minimum");
    let workspace_minimum = semver[workspace].get("minimum");
    if let (Some(component_minimum), Some(workspace_minimum)) =
        (component_minimum, workspace_minimum)
        && semver::compare(component_minimum, workspace_minimum)? == Ordering::Greater
    {
        plan.update(name, workspace, component);
        return Ok(());
    }
    plan.skip(
        name,
        &format!("the workspace range {workspace} is greater than {component} from the component"),
    );
    Ok(())
}
fn component_version_range(
    plan: &mut Plan,
    input: &Value,
    name: &str,
    workspace: &str,
    component: &str,
    peer: bool,
) -> io::Result<()> {
    let semver = &input["semver"];
    let Some(minimum) = semver[workspace].get("minimum") else {
        plan.warnings.push(format!("unable to calculate the min version of {workspace}"));
        plan.skip(
            name,
            &format!("unable to calculate the min version of {workspace} from the workspace"),
        );
        return Ok(());
    };
    if semver::compare(minimum, &semver[component]["version"])? == Ordering::Greater {
        let minimum_text = text(&semver[workspace], "minimumText")?;
        plan.skip(name, &format!("the workspace range {workspace} (min version {minimum_text}) is greater than {component} from the component"));
        return Ok(());
    }
    if semver::satisfies(semver, component, workspace)? {
        plan.update_range(semver, name, workspace, component)?;
    } else {
        plan.conflict(input, name, workspace, component, peer);
    }
    Ok(())
}
fn component_range_version(
    plan: &mut Plan,
    input: &Value,
    name: &str,
    workspace: &str,
    component: &str,
    peer: bool,
) -> io::Result<()> {
    let semver = &input["semver"];
    if semver::satisfies(semver, workspace, component)? {
        plan.update(name, workspace, component);
        return Ok(());
    }
    let Some(minimum) = semver[component].get("minimum") else {
        plan.warnings.push("unable to calculate the min version of null".into());
        plan.skip(name, "unable to calculate the min version of null from comp");
        return Ok(());
    };
    if semver::compare(minimum, &semver[workspace]["version"])? == Ordering::Greater {
        plan.conflict(input, name, workspace, component, peer);
    } else {
        let minimum_text = text(&semver[component], "minimumText")?;
        plan.skip(
            name,
            &format!("the min version from comp {minimum_text} is less than {workspace} from ws"),
        );
    }
    Ok(())
}
impl Plan {
    fn skip(&mut self, name: &str, reason: &str) {
        self.logs.push(format!("{name} - not updating. {reason}"));
    }
    fn update(&mut self, name: &str, workspace: &str, component: &str) {
        self.logs.push(format!("{name} - updating from {workspace} to {component}"));
        self.updates.push(json!([name, workspace, component]));
    }
    fn conflict(
        &mut self,
        input: &Value,
        name: &str,
        workspace: &str,
        component: &str,
        peer: bool,
    ) {
        if input["strategy"] == "theirs" {
            self.update(name, workspace, component);
            return;
        }
        let field = if peer { "peerDependencies" } else { "dependencies" };
        if let Some(rows) = self.conflicts
            .entry(field)
            .or_insert_with(|| json!([]))
            .as_array_mut()
        {
            rows.push(json!({"name":name,"version":format!("CONFLICT::{workspace}::{component}")}));
        }
        self.logs.push(format!("{name} - conflict. ours: {workspace}, theirs: {component}"));
    }
    fn update_range(
        &mut self,
        semver: &Value,
        name: &str,
        workspace: &str,
        component: &str,
    ) -> io::Result<()> {
        let prefix = workspace
            .chars()
            .next()
            .ok_or_else(|| invalid("empty workspace range"))?;
        let range = format!("{prefix}{component}");
        if range == workspace {
            self.skip(
                name,
                &format!(
                    "the workspace range {workspace} already matches {component} from the component",
                ),
            );
            return Ok(());
        }
        if semver[&range].get("range").is_none() {
            let warning = format!(
                r#"failed to add the range "{prefix}" to {component}, the result is not a valid range"#,
            );
            self.warnings.push(warning.clone());
            self.skip(name, &warning);
            return Ok(());
        }
        self.logs.push(format!(
            "{name} - updating from {workspace} to {range} (new range based on {component})",
        ));
        self.updates.push(json!([name, workspace, range]));
        Ok(())
    }
}
