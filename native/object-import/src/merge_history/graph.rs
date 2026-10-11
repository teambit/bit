use super::{count, hash, invalid, path};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    io,
    path::PathBuf,
};
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Version {
    hash: String,
    parents: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    unrelated: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    squashed: Option<Vec<String>>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Load {
    objects_directory: PathBuf,
    heads: Vec<String>,
    cached: Vec<Version>,
    overlay: Vec<Version>,
    from: Option<String>,
    #[serde(default)]
    stop_at: Vec<String>,
}
fn validate(versions: &[Version]) -> io::Result<()> {
    count(versions.len())?;
    let mut seen = HashSet::new();
    let mut edges = 0;
    for version in versions {
        hash(&version.hash)?;
        if !seen.insert(&version.hash) {
            return Err(invalid("history duplicate record"));
        }
        for parent in edges_of(version, true) {
            hash(&parent)?;
            edges += 1;
            if edges > super::MAX_FILES * 16 {
                return Err(invalid("history edge limit"));
            }
        }
    }
    Ok(())
}
fn put(versions: &mut Vec<Version>, version: Version) {
    if let Some(found) = versions
        .iter_mut()
        .find(|item| item.hash == version.hash)
    {
        *found = version;
    } else {
        versions.push(version);
    }
}
struct Reader<'a> {
    repository: crate::read_version::Reader<'a>,
}
impl Reader<'_> {
    fn version(&mut self, current: &str) -> io::Result<Version> {
        let value = self.repository.read(current)?;
        let parents = value
            .get("parents")
            .filter(|value| !value.is_null())
            .cloned()
            .unwrap_or(json!([]));
        let unrelated = value
            .get("unrelated")
            .and_then(|item| item.get("head"))
            .cloned();
        let squashed = value
            .get("squashed")
            .and_then(|item| item.get("previousParents"))
            .cloned();
        let version: Version = serde_json::from_value(
            json!({"hash":current,"parents":parents,"unrelated":unrelated,"squashed":squashed}),
        )
        .map_err(io::Error::other)?;
        validate(std::slice::from_ref(&version))?;
        Ok(version)
    }
    fn traverse(
        &mut self,
        head: &str,
        cached: &[Version],
        added: &mut Vec<Version>,
    ) -> io::Result<()> {
        hash(head)?;
        let mut stack = vec![head.to_string()];
        while let Some(current) = stack.pop() {
            if cached
                .iter()
                .chain(added.iter())
                .any(|item| item.hash == current)
            {
                continue;
            }
            count(cached.len() + added.len() + 1)?;
            let version = self.version(&current)?;
            for parent in version.parents.iter().rev() {
                stack.push(parent.clone());
            }
            added.push(version);
        }
        Ok(())
    }
}
fn heads(request: &Load) -> io::Result<Vec<String>> {
    count(request.heads.len())?;
    let mut heads = request.heads.clone();
    for version in &request.overlay {
        for parent in &version.parents {
            if !request.overlay
                .iter()
                .chain(request.cached.iter())
                .any(|item| item.hash == *parent)
            {
                heads.push(parent.clone());
            }
        }
    }
    count(heads.len())?;
    Ok(heads)
}
pub(super) fn load(request: &Load) -> io::Result<Value> {
    path(&request.objects_directory)?;
    validate(&request.cached)?;
    validate(&request.overlay)?;
    count(request.stop_at.len())?;
    for item in &request.stop_at {
        hash(item)?;
    }
    let mut versions = request.cached.clone();
    let mut added = Vec::new();
    let mut reader =
        Reader { repository: crate::read_version::Reader::new(&request.objects_directory)? };
    for head in heads(request)? {
        reader.traverse(&head, &versions, &mut added)?;
    }
    for version in &added {
        put(&mut versions, version.clone());
    }
    for version in &request.overlay {
        put(&mut versions, version.clone());
    }
    validate(&versions)?;
    let mut data = json!({"versions":versions,"added":added,"missing":[]});
    if let Some(from) = &request.from {
        hash(from)?;
        data["hashes"] = json!(subset(&versions, from, &request.stop_at));
    }
    Ok(data)
}
fn subset(versions: &[Version], from: &str, stop: &[String]) -> Vec<String> {
    let index: HashMap<_, _> = versions
        .iter()
        .map(|version| (version.hash.as_str(), version))
        .collect();
    let mut stack = vec![from.to_string()];
    let mut seen = HashSet::from([from.to_string()]);
    let mut result = Vec::new();
    while let Some(current) = stack.pop() {
        if stop.contains(&current) {
            continue;
        }
        let Some(version) = index.get(current.as_str()) else {
            continue;
        };
        result.push(current);
        for parent in version.parents.iter().rev() {
            if !stop.contains(parent)
                && index.contains_key(parent.as_str())
                && seen.insert(parent.clone())
            {
                stack.push(parent.clone());
            }
        }
    }
    result
}
fn edges_of(version: &Version, full: bool) -> Vec<String> {
    let mut result = version.parents.clone();
    if full {
        result.extend(version.unrelated.iter().cloned());
        result.extend(
            version.squashed
                .iter()
                .flatten()
                .filter(|parent| !version.parents.contains(parent))
                .cloned(),
        );
    } else {
        result.retain(|parent| version.unrelated.as_ref() != Some(parent));
    }
    let mut seen = HashSet::new();
    result.retain(|item| seen.insert(item.clone()));
    result
}
struct Graph {
    edges: HashMap<String, Vec<String>>,
}
impl Graph {
    fn new(versions: &[Version], full: bool) -> Self {
        let edges = versions
            .iter()
            .map(|version| (version.hash.clone(), edges_of(version, full)))
            .collect();
        Self { edges }
    }
    fn successors(&self, from: &str) -> Vec<String> {
        let mut stack = vec![from.to_string()];
        let mut visited = HashSet::new();
        let mut found = HashSet::new();
        let mut result = Vec::new();
        while let Some(current) = stack.pop() {
            if found.insert(current.clone()) {
                result.push(current.clone());
            }
            if visited.insert(current.clone())
                && let Some(parents) = self.edges.get(&current)
            {
                for parent in parents.iter().rev() {
                    stack.push(parent.clone());
                }
            }
        }
        result
    }
    fn closest(&self, from: &str, common: &[String]) -> Option<String> {
        let mut queue = VecDeque::from([from.to_string()]);
        let mut seen = HashSet::new();
        while let Some(current) = queue.pop_front() {
            if !seen.insert(current.clone()) {
                continue;
            }
            if common.contains(&current) {
                return Some(current);
            }
            if let Some(parents) = self.edges.get(&current) {
                queue.extend(parents.iter().cloned());
            }
        }
        None
    }
}
struct Distance {
    graph: Graph,
    source: Vec<String>,
    target: Vec<String>,
    common: Vec<String>,
}
impl Distance {
    fn new(versions: &[Version], source: &str, target: &str) -> Self {
        let mut graph = Graph::new(versions, false);
        let mut left = graph.successors(source);
        let mut right = graph.successors(target);
        let mut common: Vec<_> = left
            .iter()
            .filter(|item| right.contains(item))
            .cloned()
            .collect();
        if common.is_empty() {
            graph = Graph::new(versions, true);
            let full = graph.successors(target);
            common = graph
                .successors(source)
                .into_iter()
                .filter(|item| full.contains(item))
                .collect();
            left.retain(|item| !common.contains(item));
            right.retain(|item| !common.contains(item));
        }
        Self { graph, source: left, target: right, common }
    }
    fn closest(&self, source: &str, target: &str) -> io::Result<Option<String>> {
        if self.common.is_empty() {
            return Ok(None);
        }
        if self.common.len() == 1 {
            return Ok(self.common.first().cloned());
        }
        let left = self.graph
            .closest(source, &self.common)
            .ok_or_else(|| invalid("history common source unreachable"))?;
        let right = self.graph
            .closest(target, &self.common)
            .ok_or_else(|| invalid("history common target unreachable"))?;
        Ok(Some(if self.graph.successors(&left).contains(&right) { left } else { right }))
    }
}
pub(super) fn diverge(
    versions: &[Version],
    source: &str,
    target: &str,
    unrelated: bool,
) -> io::Result<Value> {
    validate(versions)?;
    hash(source)?;
    hash(target)?;
    if !versions
        .iter()
        .any(|version| version.hash == source)
        || !versions
            .iter()
            .any(|version| version.hash == target)
    {
        return Err(invalid("history missing head"));
    }
    if source == target {
        return Ok(json!({"sourceOnly":[],"targetOnly":[],"noCommon":false,"common":source}));
    }
    let distance = Distance::new(versions, source, target);
    let closest = distance.closest(source, target)?;
    let source_only: Vec<_> = distance.source
        .iter()
        .filter(|item| !distance.target.contains(item))
        .collect();
    let target_only: Vec<_> = distance.target
        .iter()
        .filter(|item| !distance.source.contains(item))
        .collect();
    let version_unrelated = versions
        .iter()
        .find(|version| version.hash == source)
        .is_some_and(|version| version.unrelated.as_deref() == Some(target));
    let mut data = json!({"sourceOnly":source_only,"targetOnly":target_only,"noCommon":closest.is_none()&&!unrelated&&!version_unrelated});
    if let Some(common) = closest {
        data["common"] = json!(common);
    }
    Ok(data)
}
