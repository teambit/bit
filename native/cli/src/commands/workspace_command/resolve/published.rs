//! npm registry facts influence native semantic allocation before snapshot callbacks.

use super::{ResolveRequest, Selection, Session, array, decline, grammar, json, text};
use crate::commands::status::{capture, policy};
use serde_json::Value;
use std::{collections::HashMap, io};

pub(super) fn resolve(
    session: &mut Session<'_>,
    request: &ResolveRequest<'_>,
    plan: &mut Value,
    startup: Option<&mut crate::commands::status::autosync::Startup>,
) -> io::Result<()> {
    if !enabled(request, plan) {
        return Ok(());
    }
    let candidates = candidates(session, plan)?;
    if candidates.is_empty() {
        return Ok(());
    }
    let startup = startup.ok_or_else(|| decline("registry facts require snapshot startup owner"))?;
    startup.committed = true;
    let before = capture::callback_load_stdout(&session.capture).len();
    let versions = match lookup(&mut session.capture, session.root, &candidates) {
        Ok(versions) => versions,
        Err(error) => {
            let mut progress = plan["progress"].clone();
            progress["snapFailed"] = json!(true);
            startup.build_progress = Some(progress);
            return Err(error);
        }
    };
    plan["progress"]["versionNotice"] =
        json!(&capture::callback_load_stdout(&session.capture)[before..]);
    if versions.is_empty() {
        return Ok(());
    }
    let semver = grammar::snapshot(versions.values().map(String::as_str))
        .ok_or_else(|| decline("registry version grammar limits"))?;
    let updated:Value = session.engine.request(&json!({"kind":"commandTagVersionOverrides","token":session.token,"versions":versions,"semver":semver}))?;
    super::check_token(&updated, &session.token)?;
    plan["result"] = updated["result"].clone();
    let notice = format!(
        "{}{}",
        plan["progress"]["versionNotice"].as_str().unwrap_or_default(),
        report(&candidates, &versions),
    );
    plan["progress"]["versionNotice"] = json!(notice);
    Ok(())
}

fn enabled(request: &ResolveRequest<'_>, plan: &Value) -> bool {
    let Selection::Tag { tag_options, .. } = &request.selection else { return false };
    plan["noop"] != true
        && request.options["policy"]["skipPublishedVersions"] == true
        && tag_options["soft"] != true
        && tag_options["exactVersion"].is_null()
        && tag_options["versionsFile"].is_null()
}

fn candidates(session: &Session<'_>, plan: &Value) -> io::Result<Vec<Value>> {
    let selected = plan.get("tagPatternSelections");
    let ids = array(plan["result"].get("taggedComponents"), "registry tagged components")?
        .iter()
        .chain(
            array(plan["result"].get("autoTaggedResults"), "registry automatic components")?
                .iter()
                .map(|row| &row["id"]),
        );
    ids.filter_map(|id| candidate(session, plan, id, selected).transpose())
        .collect()
}

fn candidate(
    session: &Session<'_>,
    plan: &Value,
    id: &Value,
    selected: Option<&Value>,
) -> io::Result<Option<Value>> {
    let (identity, version) = text(Some(id))?
        .rsplit_once('@')
        .map(|(identity, version)| (identity.trim(), version.trim()))
        .filter(|(identity, version)| !identity.is_empty() && !version.is_empty())
        .ok_or_else(|| decline("registry component version"))?;
    if explicit(session, identity, selected) {
        return Ok(None);
    }
    let material = array(plan.get("tagRegistryVersions"), "registry native versions")?
        .iter()
        .find(|row| row["identity"] == identity)
        .ok_or_else(|| decline("registry native component absent"))?;
    let config = material["extensions"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|row| crate::commands::update_cmd::matches_aspect(row, "teambit.pkg/pkg"))
        .map_or(&Value::Null, |row| &row["config"]);
    if config["avoidPublishToNPM"] == true
        || (config["packageJson"]["name"].is_null()
            && config["packageJson"]["publishConfig"].is_null())
    {
        return Ok(None);
    }
    Ok(Some(
        json!({"id":identity,"packageName":package_name(session, material, identity, config)?,"version":version,"registryUrl":registry(config)}),
    ))
}

fn package_name(
    session: &Session<'_>,
    material: &Value,
    identity: &str,
    config: &Value,
) -> io::Result<String> {
    if let Some(target) = array(session.context.get("targets"), "registry targets")?
        .iter()
        .find(|target| target["identity"] == identity)
    {
        return policy::status_policy(&session.context, target).map(|policy| policy.package_name);
    }
    let (scope, name) =
        identity.split_once('/').ok_or_else(|| decline("registry component identity"))?;
    let id = bit_install::model::ComponentId {
        scope: Some(scope.to_string()),
        name: name.to_string(),
        version: None,
        default_scope: None,
    };
    let aspects = serde_json::Map::from_iter([("teambit.pkg/pkg".to_string(), config.clone())]);
    Ok(bit_install::workspace::component_package_name(
        &id,
        material["bindingPrefix"].as_str(),
        &aspects,
    ))
}

fn explicit(session: &Session<'_>, identity: &str, selections: Option<&Value>) -> bool {
    let entered = selections
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|row| row["identity"] == identity)
        .filter_map(|row| row["version"].as_str());
    let pending = session.context["targets"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|target| target["identity"] == identity)
        .filter_map(|target| target["nextVersion"]["version"].as_str());
    entered
        .chain(pending)
        .any(|version| node_semver::npm::valid(version).is_some())
}

fn registry(config: &Value) -> Option<String> {
    let args = config["packageManagerPublishArgs"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect::<Vec<_>>()
        .join(" ");
    if let Some((_, registry)) = args
        .split_once("--registry ")
        .or_else(|| args.split_once("--registry="))
    {
        return registry
            .split_whitespace()
            .next()
            .map(str::to_string);
    }
    config["packageJson"]["publishConfig"]["registry"].as_str().map(str::to_string)
}

fn lookup(
    capture: &mut capture::Capture,
    root: &std::path::Path,
    candidates: &[Value],
) -> io::Result<HashMap<String, String>> {
    let mut pending = candidates.to_vec();
    let mut versions = HashMap::new();
    for _ in 0..=20 {
        let facts = capture::snapshot_registry(capture, root, &json!(pending))?;
        let published = array(facts.get("published"), "registry publication facts")?;
        if published.len() != pending.len() {
            return Err(decline("registry publication fact count"));
        }
        let next = round(pending, published, candidates, &mut versions)?;
        if next.is_empty() {
            return Ok(versions);
        }
        pending = next;
    }
    let candidate =
        pending.first().ok_or_else(|| decline("registry exhausted candidate absent"))?;
    let original = candidates
        .iter()
        .find(|original| original["id"] == candidate["id"])
        .ok_or_else(|| decline("registry original candidate absent"))?;
    Err(decline(format!(
        "unable to find an unpublished version for {}, the 20 versions following {} are all in the registry.\nthis is unlikely to be a stuck release. make sure the package name is correct and that the registry is not returning stale data",
        text(original.get("packageName"))?,
        text(original.get("version"))?,
    )))
}

fn round(
    pending: Vec<Value>,
    published: &[Value],
    originals: &[Value],
    versions: &mut HashMap<String, String>,
) -> io::Result<Vec<Value>> {
    let mut next = Vec::new();
    for (mut candidate, published) in pending.into_iter().zip(published) {
        let identity = text(candidate.get("id"))?.to_string();
        if published == true {
            let current = text(candidate.get("version"))?;
            let parts =
                grammar::snapshot([current]).ok_or_else(|| decline("registry version limits"))?;
            let version = bit_object_import::next_published_version(&parts[current]["version"])?;
            candidate["version"] = json!(version);
            next.push(candidate);
        } else if originals
            .iter()
            .find(|row| row["id"] == identity)
            .is_some_and(|original| original["version"] != candidate["version"])
        {
            versions.insert(identity, text(candidate.get("version"))?.to_string());
        }
    }
    Ok(next)
}

fn report(candidates: &[Value], versions: &HashMap<String, String>) -> String {
    let formatter = crate::commands::workspace_command::format::Formatter::new(
        crate::commands::color::Chalk::detect(&std::env::args_os().collect::<Vec<_>>()),
    );
    let items = candidates
        .iter()
        .filter_map(|candidate| {
            let identity = candidate["id"].as_str()?;
            let version = versions.get(identity)?;
            Some(formatter.item(&format!(
                "{}: {} is taken, tagging {version}",
                candidate["packageName"].as_str()?,
                candidate["version"].as_str()?,
            )))
        })
        .collect::<Vec<_>>();
    format!(
        "  {}\n",
        formatter.section(
            "Versions already in the registry",
            "an earlier run published these versions, tagging the next free one instead",
            &items
        ),
    )
}
