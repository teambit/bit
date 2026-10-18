pub(super) mod batch;
mod eol;

use super::{Plan, invalid, refactor, unsupported};
use serde_json::Value;
use std::{
    collections::BTreeSet,
    fs, io,
    path::{Path, PathBuf},
};

pub(super) struct Change {
    pub(super) source: PathBuf,
    pub(super) destination: PathBuf,
    pub(super) bytes: Vec<u8>,
    permissions: fs::Permissions,
    before: Vec<u8>,
    writer: eol::Writer,
}
pub(super) fn prepare(plan: &mut Plan, facts: &Value) -> io::Result<()> {
    let component = facts["components"]
        .as_array()
        .and_then(|rows| {
            rows.iter()
                .find(|row| row["identity"] == plan.identity.source)
        });
    let files = component
        .and_then(|row| row["files"].as_array())
        .ok_or_else(|| unsupported("rename source file inventory"))?;
    let mut destinations = BTreeSet::new();
    for file in files {
        let relative = file
            .as_str()
            .or_else(|| file["relativePath"].as_str())
            .ok_or_else(|| unsupported("rename source file path"))?;
        let change = change(
            plan,
            relative,
            component.ok_or_else(|| unsupported("rename source inventory"))?,
        )?;
        if !destinations.insert(change.destination.clone()) {
            return Err(invalid("rename file collision"));
        }
        plan.files.push(change);
    }
    prepare_dependencies(plan, facts)
}
fn prepare_dependencies(plan: &mut Plan, facts: &Value) -> io::Result<()> {
    if !plan.options.refactor {
        return Ok(());
    }
    if plan.identity.exported {
        // Validate now; package replacements follow onAdd and original removal.
        let target = std::mem::take(&mut plan.files);
        dependencies(plan, facts)?;
        plan.files = target;
        Ok(())
    } else {
        dependencies(plan, facts)
    }
}
fn change(plan: &mut Plan, relative: &str, component: &Value) -> io::Result<Change> {
    let source = plan.root.join(&plan.identity.source_directory).join(relative);
    plan.observed.ancestors(
        &plan.root,
        source.parent().ok_or_else(|| unsupported("rename source parent"))?,
    )?;
    let bytes = super::required(&mut plan.observed, &source)?;
    let before = bytes.clone();
    let bytes =
        if plan.identity.exported { overlaid(plan, component, relative, bytes)? } else { bytes };
    let name = if plan.options.preserve {
        relative.into()
    } else {
        refactor::filename(
            relative,
            leaf(&plan.identity.source_name),
            leaf(&plan.identity.target_name),
        )?
    };
    let bytes = if plan.options.preserve || (plan.options.ast && !plan.identity.exported) {
        bytes
    } else {
        refactor::content(
            &bytes,
            leaf(&plan.identity.source_name),
            leaf(&plan.identity.target_name),
        )?
    };
    let destination = plan.root.join(&plan.identity.target_directory).join(name);
    safe_parent(&plan.root, &destination)?;
    Ok(Change {
        writer: eol::Writer::target(plan.identity.exported, plan.options.preserve),
        before,
        permissions: fs::metadata(&source)?.permissions(),
        source,
        destination,
        bytes,
    })
}
fn dependencies(plan: &mut Plan, facts: &Value) -> io::Result<()> {
    let source =
        facts["sourcePackage"].as_str().ok_or_else(|| unsupported("rename source package"))?;
    let target =
        facts["targetPackage"].as_str().ok_or_else(|| unsupported("rename target package"))?;
    let mut matcher = refactor::PackageMatcher::new(source, target);
    for change in &mut plan.files {
        change.bytes = matcher.apply(&change.bytes)?;
    }
    for component in
        facts["components"].as_array().ok_or_else(|| unsupported("rename refactor inventory"))?
    {
        if component["identity"] == plan.identity.source {
            continue;
        }
        dependent(plan, component, &mut matcher)?;
    }
    Ok(())
}
fn dependent(
    plan: &mut Plan,
    component: &Value,
    matcher: &mut refactor::PackageMatcher,
) -> io::Result<()> {
    let directory =
        component["rootDir"].as_str().ok_or_else(|| unsupported("rename dependent root"))?;
    let mut changes = Vec::new();
    let mut changed = false;
    for file in
        component["files"].as_array().ok_or_else(|| unsupported("rename dependent files"))?
    {
        let relative = file.as_str().ok_or_else(|| unsupported("rename dependent path"))?;
        let (change, replaced) = dependent_file(plan, component, directory, relative, matcher)?;
        changed |= replaced;
        changes.push(change);
    }
    if changed {
        plan.files.extend(changes);
    }
    Ok(())
}
fn dependent_file(
    plan: &mut Plan,
    component: &Value,
    directory: &str,
    relative: &str,
    matcher: &mut refactor::PackageMatcher,
) -> io::Result<(Change, bool)> {
    let path = plan.root.join(directory).join(relative);
    plan.observed.ancestors(
        &plan.root,
        path.parent().ok_or_else(|| unsupported("rename dependent parent"))?,
    )?;
    let before = super::required(&mut plan.observed, &path)?;
    let loaded = overlaid(plan, component, relative, before.clone())?;
    let bytes = matcher.apply(&loaded)?;
    let changed = bytes != loaded;
    Ok((
        Change {
            writer: eol::Writer::Workspace,
            before,
            permissions: fs::metadata(&path)?.permissions(),
            source: path.clone(),
            destination: path,
            bytes,
        },
        changed,
    ))
}
pub(super) fn apply(plan: &Plan) -> io::Result<()> {
    super::cleanup::apply(plan)?;
    for change in &plan.files {
        if let Some(parent) = change.destination.parent() {
            fs::create_dir_all(parent)?;
        }
        let bytes = change.writer.contents(change.bytes.clone(), cfg!(windows));
        fs::write(&change.destination, bytes)?;
        fs::set_permissions(&change.destination, change.permissions.clone())?;
    }
    if plan.cleanup.is_none() { cleanup_sources(plan) } else { Ok(()) }
}
fn cleanup_sources(plan: &Plan) -> io::Result<()> {
    for change in &plan.files {
        if !plan.identity.exported
            && change.source != change.destination
            && !plan.files
                .iter()
                .any(|other| other.destination == change.source)
        {
            fs::remove_file(&change.source)?;
        }
    }
    if !plan.identity.exported
        && plan.identity.source_directory != plan.identity.target_directory
    {
        remove_empty(&plan.root.join(&plan.identity.source_directory))?;
    }
    Ok(())
}
fn remove_empty(path: &Path) -> io::Result<()> {
    if fs::read_dir(path)?.next().is_none() {
        fs::remove_dir(path)?;
    }
    Ok(())
}

pub(super) fn validate(plan: &Plan) -> io::Result<()> {
    for change in &plan.files {
        safe_parent(&plan.root, &change.destination)?;
        if fs::read(&change.source)? != change.before {
            return Err(unsupported("rename source changed before publication"));
        }
    }
    Ok(())
}

fn leaf(name: &str) -> &str {
    name.rsplit('/').next().unwrap_or(name)
}

fn safe_parent(root: &Path, path: &Path) -> io::Result<()> {
    for directory in path
        .parent()
        .into_iter()
        .flat_map(Path::ancestors)
    {
        if !directory.starts_with(root) {
            break;
        }
        match fs::symlink_metadata(directory) {
            Ok(metadata) if !metadata.is_dir() || metadata.file_type().is_symlink() => {
                return Err(unsupported("rename target parent is not a regular directory"));
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Ok(())
}

fn overlaid(
    plan: &mut Plan,
    component: &Value,
    relative: &str,
    original: Vec<u8>,
) -> io::Result<Vec<u8>> {
    let Some(path) = component["sourceOverlays"].get(relative).and_then(Value::as_str) else {
        return Ok(original);
    };
    let root = Path::new(
        component["sourceOverlayRoot"]
            .as_str()
            .ok_or_else(|| unsupported("rename callback source root"))?,
    );
    let path = Path::new(path);
    if !path.starts_with(root)
        || root
            .file_name()
            .and_then(|name| name.to_str())
            .is_none_or(|name| !name.starts_with("bit-native-callback-"))
    {
        return Err(unsupported("rename callback source outside private root"));
    }
    let temporary = std::env::temp_dir().canonicalize()?;
    if root
        .parent()
        .ok_or_else(|| unsupported("rename callback source parent"))?
        .canonicalize()?
        != temporary
    {
        return Err(unsupported("rename callback source is not private temporary data"));
    }
    plan.observed.ancestors(
        root,
        path.parent().ok_or_else(|| unsupported("rename callback source path"))?,
    )?;
    super::required(&mut plan.observed, path)
}

pub(super) fn target_load(
    plan: &mut Plan,
    component: &Value,
    packages: (&str, &str),
) -> io::Result<()> {
    let source_root = plan.root.join(&plan.identity.source_directory);
    let mut imports_changed = false;
    let mut matcher = refactor::PackageMatcher::new(packages.0, packages.1);
    for index in 0..plan.files.len() {
        let Some(relative) = relative_path(&source_root, &plan.files[index].source) else {
            continue;
        };
        let (bytes, changed) = target_bytes(plan, component, &relative, index, &mut matcher)?;
        imports_changed |= changed;
        plan.files[index].bytes = bytes;
    }
    if plan.options.preserve && !imports_changed {
        plan.files.retain(|file| !file.source.starts_with(&source_root));
    }
    Ok(())
}

fn relative_path(root: &Path, source: &Path) -> Option<String> {
    source
        .strip_prefix(root)
        .ok()?
        .components()
        .map(|part| part.as_os_str().to_str())
        .collect::<Option<Vec<_>>>()
        .map(|parts| parts.join("/"))
}

pub(super) fn refactor_loaded(
    plan: &mut Plan,
    rows: &[Value],
    packages: (&str, &str),
) -> io::Result<()> {
    let source_root = plan.root.join(&plan.identity.source_directory);
    if plan.identity.exported {
        plan.files.clear();
    } else {
        plan.files.retain(|file| file.source.starts_with(&source_root));
    }
    let mut matcher = refactor::PackageMatcher::new(packages.0, packages.1);
    for row in rows {
        if row["identity"] == plan.identity.source && !plan.options.deprecate
            || row["identity"] == plan.identity.target && !plan.identity.exported
        {
            continue;
        }
        let component = loaded_dependency(row)?;
        dependent(plan, &component, &mut matcher)?;
    }
    Ok(())
}

fn loaded_dependency(row: &Value) -> io::Result<Value> {
    let mut component = row.clone();
    component["rootDir"] = row["directory"].clone();
    component["files"] = Value::Array(
        row["files"]
            .as_array()
            .ok_or_else(|| unsupported("rename loaded dependency files"))?
            .iter()
            .map(|file| if file.is_string() { file.clone() } else { file["relativePath"].clone() })
            .collect(),
    );
    Ok(component)
}

fn target_bytes(
    plan: &mut Plan,
    component: &Value,
    relative: &str,
    index: usize,
    matcher: &mut refactor::PackageMatcher,
) -> io::Result<(Vec<u8>, bool)> {
    let original = plan.files[index].before.clone();
    let mut bytes = overlaid(plan, component, relative, original)?;
    if !plan.options.preserve && !plan.options.ast {
        bytes = refactor::content(
            &bytes,
            leaf(&plan.identity.source_name),
            leaf(&plan.identity.target_name),
        )?;
    }
    let mut changed = false;
    if plan.options.refactor {
        let replaced = matcher.apply(&bytes)?;
        changed = replaced != bytes;
        bytes = replaced;
    }
    Ok((bytes, changed))
}

pub(super) fn write_changes(changes: &[Change]) -> io::Result<()> {
    for change in changes {
        if let Some(parent) = change.destination.parent() {
            fs::create_dir_all(parent)?;
        }
        let bytes = change.writer.contents(change.bytes.clone(), cfg!(windows));
        fs::write(&change.destination, bytes)?;
        fs::set_permissions(&change.destination, change.permissions.clone())?;
    }
    Ok(())
}
