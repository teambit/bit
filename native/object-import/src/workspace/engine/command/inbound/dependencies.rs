//! `ImportComponents.getFlattenedDepsUnique`: select workspace dependencies
//! from the imported root Versions before planning any bitmap or file writes.
use super::{Prepare, Target, details, invalid, write};
use crate::command_import::PreparedImport;
use node_semver::npm;
use serde_json::Value;
use std::{
    cmp::Ordering,
    collections::{HashMap, HashSet},
    io,
};

type Adjacency = HashMap<String, Vec<Target>>;

pub(super) fn expand(
    input: &Prepare,
    roots: &[Target],
    imported: &PreparedImport,
) -> io::Result<Vec<Target>> {
    let options = &input.options.dependencies;
    if !options.import_dependencies && !options.import_head_dependencies {
        return Ok(roots.to_vec());
    }
    let dependencies = if let Some(depth) = options.dependencies_depth {
        by_depth(input, roots, imported, depth)?
    } else {
        all(input, roots, imported)?
    };
    let dependencies =
        if options.import_head_dependencies { heads(dependencies)? } else { newest(dependencies)? };
    append(roots, dependencies)
}

fn heads(dependencies: Vec<Target>) -> io::Result<Vec<Target>> {
    let mut seen = HashSet::new();
    let mut heads = Vec::new();
    for mut target in dependencies {
        target.version = "latest".into();
        if seen.insert(identity(&target)?) {
            heads.push(target);
        }
    }
    Ok(heads)
}

fn append(roots: &[Target], dependencies: Vec<Target>) -> io::Result<Vec<Target>> {
    let selected = roots
        .iter()
        .map(identity)
        .collect::<io::Result<HashSet<_>>>()?;
    let mut targets = roots.to_vec();
    targets.extend(
        dependencies
            .into_iter()
            .filter(|target| identity(target).is_ok_and(|id| !selected.contains(&id))),
    );
    if targets.len() > 4096 {
        return Err(invalid("inbound dependency target limit"));
    }
    Ok(targets)
}

fn all(input: &Prepare, roots: &[Target], imported: &PreparedImport) -> io::Result<Vec<Target>> {
    let mut result = Vec::new();
    for root in roots {
        let (_, version) = root_version(input, root, imported)?;
        let deps = version["flattenedDependencies"]
            .as_array()
            .ok_or_else(|| invalid("inbound flattened dependencies"))?;
        let dev_deps = version["flattenedDevDependencies"].as_array();
        result.extend(
            deps.iter()
                .chain(dev_deps.into_iter().flatten())
                .map(target)
                .collect::<io::Result<Vec<_>>>()?,
        );
    }
    Ok(result)
}

fn by_depth(
    input: &Prepare,
    roots: &[Target],
    imported: &PreparedImport,
    depth: usize,
) -> io::Result<Vec<Target>> {
    let (adjacency, mut current) = graph(input, roots, imported)?;
    let roots = roots
        .iter()
        .map(identity)
        .collect::<io::Result<HashSet<_>>>()?;
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for _ in 0..depth {
        current = layer(&adjacency, &current, &roots, &mut seen, &mut result)?;
        if current.is_empty() {
            break;
        }
    }
    Ok(result)
}

pub(super) fn graph(
    input: &Prepare,
    roots: &[Target],
    imported: &PreparedImport,
) -> io::Result<(Adjacency, Vec<String>)> {
    let mut adjacency = HashMap::<String, Vec<Target>>::new();
    let mut current = Vec::new();
    for root in roots {
        let (version_name, version) = root_version(input, root, imported)?;
        current.push(format!("{}@{version_name}", identity(root)?));
        for edge in edges(input, imported, &version)? {
            let source = target(&edge["source"])?;
            let destination = target(&edge["target"])?;
            adjacency
                .entry(versioned(&source)?)
                .or_default()
                .push(destination);
        }
    }
    Ok((adjacency, current))
}

fn layer(
    adjacency: &HashMap<String, Vec<Target>>,
    current: &[String],
    roots: &HashSet<String>,
    seen: &mut HashSet<String>,
    result: &mut Vec<Target>,
) -> io::Result<Vec<String>> {
    let mut next = Vec::new();
    for id in current {
        for dependency in adjacency.get(id).into_iter().flatten() {
            let name = identity(dependency)?;
            let versioned = versioned(dependency)?;
            if roots.contains(&name) || !seen.insert(versioned.clone()) {
                continue;
            }
            result.push(dependency.clone());
            next.push(versioned);
        }
    }
    Ok(next)
}

fn root_version(
    input: &Prepare,
    root: &Target,
    imported: &PreparedImport,
) -> io::Result<(String, Value)> {
    let scope = root.scope.as_deref().ok_or_else(|| invalid("inbound dependency root scope"))?;
    let model = details::model(&input.root, imported, scope, &root.name)?;
    let (name, hash) = write::version(&model, &root.version)?;
    let version = match imported.overlay.read(&hash, "Version")? {
        Some(version) => version.clone(),
        None => details::local_object(&input.root, &hash, "Version")?
            .ok_or_else(|| invalid("inbound dependency root Version"))?,
    };
    crate::history_query::validate_version(&version)?;
    Ok((name, version))
}

fn edges(input: &Prepare, imported: &PreparedImport, version: &Value) -> io::Result<Vec<Value>> {
    let rows = if let Some(rows) = version["flattenedEdges"].as_array() {
        rows.clone()
    } else if let Some(hash) = version["flattenedEdgesRef"].as_str() {
        let bytes = if let Some(bytes) = imported.overlay.source(hash) {
            bytes.to_vec()
        } else {
            let mut compressed = 0;
            crate::checkout::repository::source(
                &crate::scope_path(&input.root).join("objects"),
                crate::merge_history::hash(hash)?,
                32 * 1024 * 1024,
                &mut compressed,
            )?
        };
        crate::parse_jsonc(&bytes)
            .and_then(|val| serde_json::from_value::<Vec<Value>>(val).map_err(io::Error::other))?
    } else {
        Vec::new()
    };
    if rows.is_empty()
        && (version["flattenedDependencies"]
            .as_array()
            .is_some_and(|dependencies| !dependencies.is_empty())
            || version["flattenedDevDependencies"]
                .as_array()
                .is_some_and(|dependencies| !dependencies.is_empty()))
    {
        return Err(invalid("inbound dependency graph missing"));
    }
    if rows.len() > 16384 {
        return Err(invalid("inbound dependency graph limit"));
    }
    Ok(rows)
}

pub(super) fn target(value: &Value) -> io::Result<Target> {
    if let Some(text) = value.as_str() {
        let (identity, version) = text
            .rsplit_once('@')
            .filter(|(_, version)| !version.is_empty())
            .ok_or_else(|| invalid("inbound dependency version"))?;
        let (scope, name) = identity
            .split_once('/')
            .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
            .ok_or_else(|| invalid("inbound dependency scope"))?;
        return Ok(Target {
            scope: Some(scope.to_owned()),
            name: name.to_owned(),
            version: version.to_owned(),
        });
    }
    let id_obj = value
        .get("id")
        .filter(|sub| sub.is_object())
        .unwrap_or(value);
    let scope = id_obj["scope"]
        .as_str()
        .or_else(|| value["scope"].as_str())
        .filter(|scope| !scope.is_empty())
        .ok_or_else(|| invalid("inbound dependency scope"))?;
    let raw_name = id_obj["name"]
        .as_str()
        .or_else(|| value["name"].as_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| invalid("inbound dependency name"))?;
    let (name, inline_ver) = raw_name
        .rsplit_once('@')
        .map_or((raw_name, None), |(bare, ver)| (bare, Some(ver).filter(|ver| !ver.is_empty())));
    let version = value["version"]
        .as_str()
        .or_else(|| id_obj["version"].as_str())
        .or_else(|| value["head"].as_str())
        .filter(|version| !version.is_empty())
        .or(inline_ver)
        .ok_or_else(|| invalid("inbound dependency version"))?;
    Ok(Target { scope: Some(scope.to_owned()), name: name.to_owned(), version: version.to_owned() })
}

pub(super) fn identity(target: &Target) -> io::Result<String> {
    let scope = target.scope.as_deref().ok_or_else(|| invalid("inbound dependency scope"))?;
    Ok(format!("{scope}/{}", target.name))
}

pub(super) fn versioned(target: &Target) -> io::Result<String> {
    Ok(format!("{}@{}", identity(target)?, target.version))
}

fn newest(dependencies: Vec<Target>) -> io::Result<Vec<Target>> {
    let mut positions = HashMap::<String, usize>::new();
    let mut selected: Vec<Target> = Vec::new();
    for dependency in dependencies {
        let id = identity(&dependency)?;
        if let Some(&position) = positions.get(&id) {
            let current = &selected[position].version;
            let order = npm::compare(&dependency.version, current, false)
                .ok_or_else(|| invalid("inbound multiple dependency versions"))?;
            if order == Ordering::Greater {
                selected[position] = dependency;
            }
        } else {
            positions.insert(id, selected.len());
            selected.push(dependency);
        }
    }
    Ok(selected)
}
