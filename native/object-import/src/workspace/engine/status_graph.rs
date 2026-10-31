//! `GraphIdsFromFsBuilder`: reuse saved adjacency for unchanged external components.

use super::{command::repository::Repository, invalid};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    io,
    path::PathBuf,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request {
    root: PathBuf,
    versions: Vec<(String, Value)>,
    components: Vec<Component>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Component {
    identity: String,
    dependencies: Vec<String>,
}

type Graph = HashMap<String, Vec<String>>;

pub(super) fn read(request: &Request) -> io::Result<(usize, Value)> {
    super::path(&request.root)?;
    if request.versions.len() > 4096 || request.components.len() > 4096 {
        return Err(invalid("status issue graph node budget"));
    }
    let mut repository = Repository::new(&request.root, None);
    let mut graph = Graph::new();
    for (_, version) in &request.versions {
        append_version(&mut graph, version, &mut repository)?;
    }
    let external = collect_external_graph(request, &mut graph, &mut repository)?;
    let (models, heads) = metadata(request, &mut repository)?;
    repository.validate()?;
    Ok((
        external.len(),
        json!({"external":external,"models":models,"versions":heads,"readSet":repository.read_set()}),
    ))
}

fn collect_external_graph(
    request: &Request,
    graph: &mut Graph,
    repository: &mut Repository,
) -> io::Result<Vec<Value>> {
    let workspace = request.components
        .iter()
        .map(|component| component.identity.trim())
        .collect::<HashSet<_>>();
    let mut queue = request.components
        .iter()
        .flat_map(|component| {
            component.dependencies
                .iter()
                .map(|dependency| dependency.trim().to_owned())
        })
        .collect::<VecDeque<_>>();
    let mut seen = HashSet::new();
    let mut external = Vec::new();
    while let Some(identity) = queue.pop_front() {
        if identity.is_empty()
            || workspace.contains(identity.as_str())
            || !seen.insert(identity.clone())
        {
            continue;
        }
        if seen.len() > 4096 {
            return Err(invalid("status issue graph node budget"));
        }
        let dependencies = match graph.get(&identity) {
            Some(dependencies) => dependencies.clone(),
            None => read_external(&request.root, &identity, graph, repository)?,
        };
        queue.extend(dependencies.iter().cloned());
        external.push(json!({"identity":identity,"dependencies":dependencies,"model":null}));
    }
    Ok(external)
}

type ModelMetadata = (Vec<Value>, Vec<(String, Value)>);

fn metadata(request: &Request, repository: &mut Repository) -> io::Result<ModelMetadata> {
    let names = request.components
        .iter()
        .flat_map(|component| component.dependencies.iter())
        .filter_map(|id| id.rsplit_once('@').map(|(name, _)| name))
        .collect::<HashSet<_>>();
    let mut models = Vec::new();
    let mut versions = Vec::new();
    for name in names {
        let Some(model) = read_model(&request.root, repository, name)? else {
            continue;
        };
        if let Some(head) = model_head(repository, &model)? {
            versions.push(head);
        }
        models.push(model);
    }
    Ok((models, versions))
}

fn read_model(
    root: &std::path::Path,
    repository: &mut Repository,
    name: &str,
) -> io::Result<Option<Value>> {
    let mut candidates = Vec::new();
    if let Some(indexed) = indexed_model_hash(root, name) {
        candidates.push(indexed);
    }
    candidates.push(super::hash(name.as_bytes()));
    if let Some((_, bare_name)) = name.split_once('/') {
        candidates.push(super::hash(bare_name.as_bytes()));
    }
    for candidate in candidates {
        let Some(model) = optional(repository, &candidate, "Component")? else {
            continue;
        };
        if !model_matches_name(&model, name) {
            return Err(invalid("status dependency model identity"));
        }
        return Ok(Some(model));
    }
    Ok(None)
}

fn model_matches_name(model: &Value, name: &str) -> bool {
    let model_scope = model["scope"].as_str().map_or("", str::trim);
    let model_name = model["name"].as_str().map_or("", str::trim);
    let name = name.trim();
    let (expected_scope, expected_name) = name
        .split_once('/')
        .map_or(("", name), |(scope, bare)| (scope.trim(), bare.trim()));
    model_name == expected_name && (model_scope == expected_scope || model_scope.is_empty())
}

fn indexed_model_hash(root: &std::path::Path, name: &str) -> Option<String> {
    let (expected_scope, expected_name) = name
        .split_once('/')
        .unwrap_or(("", name));
    let bytes = std::fs::read(crate::scope_path(root).join("index.json")).ok()?;
    let index: Value = crate::parse_jsonc(&bytes).ok()?;
    let rows = index["components"].as_array().or_else(|| index.as_array())?;
    rows.iter()
        .find(|row| {
            let (row_scope, row_name) =
                super::command::inbound::remote::file_list::row_id_parts(row)
                    .map_or(("", ""), |(sc, nm)| (sc.unwrap_or_default(), nm));
            row["isSymlink"] != true
                && row_name == expected_name
                && (row_scope == expected_scope || row_scope.is_empty())
        })
        .and_then(|row| row["hash"].as_str())
        .map(str::to_owned)
}

fn model_head(repository: &mut Repository, model: &Value) -> io::Result<Option<(String, Value)>> {
    let Some(head) = model["head"].as_str() else {
        return Ok(None);
    };
    Ok(optional(repository, head, "Version")?.map(|version| (head.to_owned(), version)))
}

fn optional(repository: &mut Repository, reference: &str, kind: &str) -> io::Result<Option<Value>> {
    match repository.read(reference, kind) {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

fn append_version(
    graph: &mut Graph,
    version: &Value,
    repository: &mut Repository,
) -> io::Result<()> {
    let edges = match version["flattenedEdgesRef"].as_str() {
        Some(reference) => repository.source_json(reference)?,
        None => version
            .get("flattenedEdges")
            .cloned()
            .unwrap_or_else(|| json!([])),
    };
    let edges = edges.as_array().ok_or_else(|| invalid("status saved edges"))?;
    if edges.len() > 16384 {
        return Err(invalid("status saved edge budget"));
    }
    for edge in edges {
        let source = identity(&edge["source"])?;
        let target = identity(&edge["target"])?;
        graph.entry(target.clone()).or_default();
        let outgoing = graph.entry(source).or_default();
        if !outgoing.contains(&target) {
            outgoing.push(target);
        }
    }
    if graph.len() > 4096
        || graph
            .values()
            .map(Vec::len)
            .sum::<usize>()
            > 16384
    {
        return Err(invalid("status saved graph budget"));
    }
    Ok(())
}

fn read_external(
    root: &std::path::Path,
    id: &str,
    graph: &mut Graph,
    repository: &mut Repository,
) -> io::Result<Vec<String>> {
    let Some((name, tag)) = id.rsplit_once('@') else {
        return read_unversioned(root, id, graph, repository);
    };
    let Some(model) = read_model(root, repository, name)? else { return Ok(Vec::new()) };
    let reference = super::status_models::versions::reference(&model, tag)?;
    let Some(version) = optional(repository, &reference, "Version")? else { return Ok(Vec::new()) };
    append_version(graph, &version, repository)?;
    if let Some(dependencies) = graph.get(id) {
        return Ok(dependencies.clone());
    }
    let dependencies = direct_dependencies(&version)?;
    graph.insert(id.to_owned(), dependencies.clone());
    Ok(dependencies)
}

fn read_unversioned(
    root: &std::path::Path,
    id: &str,
    graph: &mut Graph,
    repository: &mut Repository,
) -> io::Result<Vec<String>> {
    let (scope, name) = id.split_once('/').ok_or_else(|| invalid("status external identity"))?;
    if scope.is_empty() || name.is_empty() || id.chars().any(char::is_whitespace) {
        return Err(invalid("status external identity"));
    }
    let Some(model) = read_model(root, repository, id)? else { return Ok(Vec::new()) };
    let Some((_, version)) = model_head(repository, &model)? else { return Ok(Vec::new()) };
    append_version(graph, &version, repository)?;
    let dependencies = direct_dependencies(&version)?;
    graph.insert(id.to_owned(), dependencies.clone());
    Ok(dependencies)
}

fn direct_dependencies(version: &Value) -> io::Result<Vec<String>> {
    let mut dependencies = Vec::new();
    let ordinary = ["dependencies", "devDependencies", "extensionDependencies"]
        .iter()
        .flat_map(|field| {
            version[field]
                .as_array()
                .into_iter()
                .flatten()
        });
    for id in ordinary {
        let dependency = identity(id)?;
        if !dependencies.contains(&dependency) {
            dependencies.push(dependency);
        }
    }
    for extension in version["extensions"]
        .as_array()
        .into_iter()
        .flatten()
    {
        let Some(ext_id) = extension
            .get("extensionId")
            .or_else(|| extension.get("legacyId"))
            .or_else(|| extension.get("id"))
        else {
            continue;
        };
        if let Ok(dependency) = identity(ext_id)
            && !dependencies.contains(&dependency)
        {
            dependencies.push(dependency);
        }
    }
    Ok(dependencies)
}

fn identity(value: &Value) -> io::Result<String> {
    if let Some(text) = value
        .as_str()
        .or_else(|| value["id"].as_str())
    {
        return validate_identity(text);
    }
    let id_obj = value
        .get("id")
        .filter(|sub| sub.is_object())
        .unwrap_or(value);
    let scope = id_obj["scope"]
        .as_str()
        .or_else(|| value["scope"].as_str())
        .ok_or_else(|| invalid("status edge scope"))?;
    let raw_name = id_obj["name"]
        .as_str()
        .or_else(|| value["name"].as_str())
        .ok_or_else(|| invalid("status edge name"))?;
    let (name, inline_ver) = raw_name
        .rsplit_once('@')
        .map_or((raw_name, None), |(bare, ver)| (bare, Some(ver).filter(|ver| !ver.is_empty())));
    let version = id_obj["version"]
        .as_str()
        .or_else(|| value["version"].as_str())
        .or_else(|| value["head"].as_str())
        .filter(|ver| !ver.is_empty())
        .or(inline_ver)
        .ok_or_else(|| invalid("status edge version"))?;
    validate_identity(&format!("{scope}/{name}@{version}"))
}

fn validate_identity(text: &str) -> io::Result<String> {
    let (name, version) = text.rsplit_once('@').ok_or_else(|| invalid("status edge identity"))?;
    if name.split_once('/').is_none() || version.is_empty() || text.chars().any(char::is_whitespace)
    {
        return Err(invalid("status edge identity"));
    }
    Ok(text.to_owned())
}
