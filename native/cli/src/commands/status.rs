//! Native `bit status --json` (`s -j`), the flow of `readRustStatus` and
//! `captureRustClientCurrent` in the Node.js glue: the workspace engine of
//! `bit-object-import` reads the workspace, models and dependency caches;
//! this module computes the policy, ignore and semver inputs Node computed.
//!
//! It runs only on a warm dependency cache. A component whose dependencies
//! need fresh detection, an invalidated cache, the `no-fs-cache` feature,
//! component-level dependency policies, other environments and every other
//! input the glue could not prove decline to the Node.js CLI, which then
//! writes the cache for the next run.

mod cache;
mod collate;
mod fresh;
mod grammar;
mod issues;
mod js;
mod policy;

use super::{
    engine::Engine,
    inventory::{Inventory, Options},
};
use crate::{commands::Command, history::History, native::Outcome, workspace};
use issues::Component;
use js::{array, decline, full_identity, text};
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "status", aliases: &["s"], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    if !matches!(args, [_, flag] if flag == "--json" || flag == "-j") {
        return Ok(Outcome::Declined("only `--json` runs natively".to_string()));
    }
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    if !collate::root_locale() {
        return Ok(Outcome::Declined("the locale may collate ids differently".to_string()));
    }
    let home = env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap_or_default();
    let result = match read(&root, Path::new(&home)) {
        Ok(result) => result,
        Err(error) => return Ok(Outcome::Declined(format!("status: {error}"))),
    };
    let history = History::start(&root, args);
    let mut stdout = io::stdout().lock();
    stdout.write_all(serde_json::to_string_pretty(&result)?.as_bytes())?;
    stdout.flush()?;
    history.end(true);
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

/// `readRustStatus`: the status result, after its history plans are committed.
fn read(root: &Path, home: &Path) -> io::Result<Value> {
    if cache::no_fs_cache(root) {
        return Err(decline("no-fs-cache may be enabled"));
    }
    let mut engine = Engine::new()?;
    let context: Value =
        engine.request(&json!({"kind": "statusContext", "root": root, "home": home}))?;
    let capture = capture(&mut engine, root, home, &context)?;
    let compared: Value = engine.request(
        &json!({"kind": "statusCompare", "root": root, "targets": capture.comparisons}),
    )?;
    let issues = issues::collect(root, &context, &capture.components)?
        .ok_or_else(|| decline("status issues need canonical loading"))?;
    let targets = result_targets(&context, &capture.components, &compared, &issues)?;
    let semver = grammar::snapshot(semver_values(&context, &targets)?.iter().map(String::as_str))
        .ok_or_else(|| decline("status semver grammar limits"))?;
    let scope = text(
        context
            .get("scope")
            .and_then(|scope| scope.get("name")),
    )?;
    let mut result: Value = engine.request(&json!({
        "kind": "statusResult",
        "currentLaneId": format!("{scope}/main"),
        "targets": targets,
        "models": context["models"],
        "histories": context["histories"],
        "semver": semver,
    }))?;
    sort_rows(&mut result)?;
    commit(&mut engine, root, &context, &capture)?;
    Ok(result)
}

struct Capture {
    comparisons: Vec<Value>,
    components: Vec<Component>,
    /// Fresh detections whose cache entries are written on commit.
    pending: Vec<fresh::Pending>,
    /// `dependencyCacheNeedsInvalidation`: every nested component is detected
    /// afresh and the whole cache is replaced on commit.
    reset: bool,
}

/// `captureRustClientCurrent` for status: each component's files and
/// dependencies, from the cache or detected afresh.
fn capture(engine: &mut Engine, root: &Path, home: &Path, context: &Value) -> io::Result<Capture> {
    let options: Options =
        serde_json::from_value(context["options"].clone()).map_err(io::Error::other)?;
    let inventory = Inventory::new(&options)?;
    let targets = array(context.get("targets"), "targets")?;
    let reset = !targets.is_empty() && cache::needs_invalidation(root)?;
    let mut captured =
        Capture { comparisons: Vec::new(), components: Vec::new(), pending: Vec::new(), reset };
    let mut facts = None;
    for target in targets {
        let scan = Scan {
            engine: &mut *engine,
            root,
            home,
            context,
            inventory: &inventory,
            facts: &mut facts,
        };
        scan.target(target, &mut captured)?;
    }
    Ok(captured)
}

struct Scan<'s> {
    engine: &'s mut Engine,
    root: &'s Path,
    home: &'s Path,
    context: &'s Value,
    inventory: &'s Inventory,
    /// Loaded on the first fresh detection: it may run Node once.
    facts: &'s mut Option<fresh::Facts>,
}

impl Scan<'_> {
    /// One target: its policy, its files, its dependencies.
    fn target(mut self, target: &Value, captured: &mut Capture) -> io::Result<()> {
        let policy = policy::status_policy(self.context, target)?;
        let directory = text(target.get("directory"))?;
        let files = self.files(directory)?;
        let main_file = target.get("mainFile").and_then(Value::as_str);
        if !main_file.is_some_and(|main| files.iter().any(|file| file == main)) {
            return Err(decline("status main file not captured"));
        }
        let mut dependencies = if captured.reset && directory != "." {
            json!({ "needsDetection": true })
        } else {
            self.cached(target, directory, &files, &policy)?
        };
        if dependencies.get("needsDetection") == Some(&Value::Bool(true)) {
            let (detected, pending) = self.detect(target, &files, &policy)?;
            dependencies = detected;
            captured.pending.push(pending);
        }
        record(target, directory, &files, &policy, &dependencies, captured)
    }

    /// `dependencyPolicyCached`.
    fn cached(
        &mut self,
        target: &Value,
        directory: &str,
        files: &[String],
        policy: &policy::Policy,
    ) -> io::Result<Value> {
        let component_root = self.root.join(directory);
        let mut request = json!({
            "kind": "dependencyPolicyCached",
            "root": self.root,
            "componentRoot": component_root,
            "identity": full_identity(target)?,
            "files": files.iter().map(|file| component_root.join(file)).collect::<Vec<_>>(),
        });
        spread(&mut request, &policy.input)?;
        self.engine.request(&request)
    }

    /// `readFreshDependencies`.
    fn detect(
        &mut self,
        target: &Value,
        files: &[String],
        policy: &policy::Policy,
    ) -> io::Result<(Value, fresh::Pending)> {
        if self.facts.is_none() {
            *self.facts = Some(fresh::Facts::new(self.home)?);
        }
        let facts = self.facts.as_ref().ok_or_else(|| decline("status facts"))?;
        let detection = fresh::Detection { root: self.root, context: self.context, facts };
        detection.read(self.engine, target, files, policy)
    }

    /// The component's files, relative to its directory.
    fn files(&mut self, directory: &str) -> io::Result<Vec<String>> {
        let others: Vec<_> = if directory == "." {
            array(self.context.get("targets"), "targets")?
                .iter()
                .filter_map(|row| row.get("directory").and_then(Value::as_str))
                .filter(|dir| *dir != ".")
                .map(|dir| self.root.join(dir))
                .collect()
        } else {
            Vec::new()
        };
        let begin = json!({
            "kind": "inventoryBegin",
            "root": self.root.join(directory),
            "workspace": self.root,
            "excludeDirs": others,
        });
        let manifest = self.inventory.scan(self.engine, begin, "inventoryFinish")?;
        array(manifest.get("files"), "inventory files")?
            .iter()
            .map(|file| text(file.get("relativePath")).map(str::to_string))
            .collect()
    }
}

/// The comparison and component rows of one captured target.
fn record(
    target: &Value,
    directory: &str,
    files: &[String],
    policy: &policy::Policy,
    dependencies: &Value,
    captured: &mut Capture,
) -> io::Result<()> {
    let current = policy::current_metadata(target, policy, dependencies)?;
    let version = target
        .get("version")
        .cloned()
        .unwrap_or(Value::Null);
    if js::truthy(Some(&version)) {
        captured.comparisons.push(json!({
            "identity": target["identity"],
            "version": version,
            "directory": directory,
            "files": files,
            "current": current,
        }));
    }
    captured.components.push(Component {
        identity: full_identity(target)?,
        package_name: policy.package_name.clone(),
        dependencies: dependency_identities(dependencies)?,
        issues: dependencies
            .get("issues")
            .cloned()
            .unwrap_or(Value::Null),
    });
    Ok(())
}

/// `{ ...request, ...policy.input }`.
fn spread(request: &mut Value, input: &Value) -> io::Result<()> {
    let request = request.as_object_mut().ok_or_else(|| decline("status request"))?;
    for (key, value) in input.as_object().ok_or_else(|| decline("status policy input"))? {
        request.insert(key.clone(), value.clone());
    }
    Ok(())
}

/// Every dependency identity, in lifecycle order.
fn dependency_identities(dependencies: &Value) -> io::Result<Vec<String>> {
    let state = &dependencies["state"];
    let entries = array(state.get("entries"), "dependency entries")?;
    let mut identities = Vec::new();
    for indices in array(state.get("components"), "dependency lifecycles")? {
        for index in array(Some(indices), "dependency indices")? {
            let entry = index
                .as_u64()
                .and_then(|index| entries.get(index as usize));
            let entry = entry.ok_or_else(|| decline("status dependency entry"))?;
            identities.push(text(entry.get("identity"))?.to_string());
        }
    }
    Ok(identities)
}

/// The rows `statusResult` reports, one per bitmap target.
fn result_targets(
    context: &Value,
    components: &[Component],
    compared: &Value,
    issues: &[Value],
) -> io::Result<Vec<Value>> {
    let comparisons = array(compared.get("comparisons"), "comparisons")?;
    let targets = array(context.get("targets"), "targets")?;
    targets
        .iter()
        .zip(components)
        .map(|(target, component)| {
            let identity = &target["identity"];
            let modified = comparisons
                .iter()
                .find(|row| row["identity"] == *identity)
                .and_then(|row| js::nullish(row.get("modified")))
                .cloned()
                .unwrap_or(Value::Bool(false));
            let issues = issues
                .iter()
                .find(|row| row["id"] == *identity)
                .map_or_else(|| json!([]), |row| row["issues"].clone());
            Ok(json!({
                "identity": identity,
                "version": target["version"],
                "modified": modified,
                "dependencies": component.dependencies,
                "issues": issues,
            }))
        })
        .collect()
}

/// Every version string the semver grammar must describe.
fn semver_values(context: &Value, targets: &[Value]) -> io::Result<Vec<String>> {
    let mut values: Vec<String> = Vec::new();
    for target in targets {
        values.push(text(target.get("version"))?.to_string());
    }
    for target in targets {
        for dependency in array(target.get("dependencies"), "dependencies")? {
            let dependency = text(Some(dependency))?;
            values.push(
                dependency
                    .split('@')
                    .nth(1)
                    .unwrap_or_default()
                    .to_string(),
            );
        }
    }
    for model in array(context.get("models"), "models")? {
        model_versions(model, &mut values)?;
    }
    for history in array(context.get("histories"), "histories")? {
        values.push(nullish_text(history.get("remoteHead"))?);
    }
    Ok(values)
}

/// A model's version names, orphaned versions and head.
fn model_versions(model: &Value, values: &mut Vec<String>) -> io::Result<()> {
    for field in ["versions", "orphanedVersions"] {
        if let Some(versions) = js::nullish(model.get(field)) {
            values.extend(js::object(versions)?.keys().cloned());
        }
    }
    values.push(nullish_text(model.get("head"))?);
    Ok(())
}

/// `value ?? ''` for a string field.
fn nullish_text(value: Option<&Value>) -> io::Result<String> {
    match js::nullish(value) {
        None => Ok(String::new()),
        Some(value) => text(Some(value)).map(str::to_string),
    }
}

/// Every array of the result except `importPendingComponents`, sorted by id
/// with `localeCompare`.
fn sort_rows(result: &mut Value) -> io::Result<()> {
    let result = result.as_object_mut().ok_or_else(|| decline("status result"))?;
    for (key, rows) in result.iter_mut() {
        let Some(rows) = rows
            .as_array_mut()
            .filter(|_| key != "importPendingComponents")
        else {
            continue;
        };
        let ids = rows
            .iter()
            .map(sort_id)
            .collect::<io::Result<Vec<_>>>()?;
        if !ids.iter().all(|id| collate::supported(id)) {
            return Err(decline("status ids outside the native collation"));
        }
        let mut order: Vec<usize> = (0..rows.len()).collect();
        order.sort_by(|&left, &right| collate::compare(&ids[left], &ids[right]));
        *rows = order
            .into_iter()
            .map(|index| rows[index].clone())
            .collect();
    }
    Ok(())
}

/// `typeof row === 'string' ? row : row.id`.
fn sort_id(row: &Value) -> io::Result<String> {
    match row {
        Value::String(id) => Ok(id.clone()),
        _ => text(row.get("id")).map(str::to_string),
    }
}

/// `capture.commit()`: staged histories validated, dependency caches written,
/// then the histories written.
fn commit(engine: &mut Engine, root: &Path, context: &Value, capture: &Capture) -> io::Result<()> {
    let plans = array(context.get("pendingHistory"), "history plans")?;
    if !plans.is_empty() {
        let validated: Value = engine.request(
            &json!({"kind": "statusHistoryValidate", "root": root, "plans": plans}),
        )?;
        if validated.get("fresh") != Some(&Value::Bool(true)) {
            return Err(decline("status history changed"));
        }
    }
    if !capture.pending.is_empty() || capture.reset {
        fresh::commit(engine, root, &capture.pending, capture.reset)?;
    }
    if plans.is_empty() {
        return Ok(());
    }
    let committed: Value =
        engine.request(&json!({"kind": "statusHistoryCommit", "root": root, "plans": plans}))?;
    let written = committed.get("written").and_then(Value::as_u64);
    if written.is_none_or(|written| written > plans.len() as u64) {
        return Err(decline("status history commit receipt"));
    }
    Ok(())
}
