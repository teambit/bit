//! `normalizePeerProviderVersions` and the node id helpers of `dependencies-graph.ts`:
//! after merging graphs, every peer provider points at the best version the merged
//! graph has for it.

use super::graph::{ROOT, edges, id, packages};
use crate::manifests::semver::{self, SemVer};
use indexmap::IndexMap;
use serde_json::{Map, Value};
use std::collections::HashMap;

/// Versions per package name, highest first (`collectVersionsByPackageName`).
type Versions = HashMap<String, Vec<String>>;

/// Rewrite peer provider ids to the best version the merged graph has.
pub fn normalize_peer_provider_versions(graph: &mut Value) {
    let versions = collect_versions(graph);
    let rewriter = Rewriter { versions: &versions, packages: packages(graph).clone() };
    let mut by_id: IndexMap<String, Value> = IndexMap::new();
    for edge in edges(graph) {
        let rewritten = rewriter.edge(edge);
        let key = id(&rewritten).to_owned();
        match by_id.get_mut(&key) {
            Some(existing) => merge_neighbours(existing, &rewritten),
            None => {
                by_id.insert(key, rewritten);
            }
        }
    }
    graph["edges"] = Value::Array(by_id.into_values().collect());
}

struct Rewriter<'a> {
    versions: &'a Versions,
    packages: Map<String, Value>,
}

impl Rewriter<'_> {
    fn peer_dependencies(&self, package: &str) -> Option<&Map<String, Value>> {
        self.packages
            .get(package)?
            .get("peerDependencies")?
            .as_object()
    }

    fn edge(&self, edge: &Value) -> Value {
        let edge_id = id(edge);
        let package = edge["attr"]["pkgId"]
            .as_str()
            .map(str::trim)
            .filter(|pkg| !pkg.is_empty())
            .unwrap_or_else(|| without_peer_suffix(edge_id));
        let peers = if edge_id == ROOT { None } else { self.peer_dependencies(package) };
        let peer_ids_by_name = self.peer_ids_by_name(edge_id, peers);
        let mut rewritten = edge.clone();
        if edge_id != ROOT {
            rewritten["id"] = Value::String(self.node_id(edge_id));
        }
        for neighbour in rewritten["neighbours"]
            .as_array_mut()
            .into_iter()
            .flatten()
        {
            let dependency = self.peer_dependency(id(neighbour), peers, &peer_ids_by_name);
            let new_id = self.node_id(&dependency);
            if new_id != id(neighbour) {
                neighbour["id"] = Value::String(new_id);
            }
        }
        rewritten
    }

    /// The rewritten peers of an edge, by package name.
    fn peer_ids_by_name(
        &self,
        edge_id: &str,
        peers: Option<&Map<String, Value>>,
    ) -> HashMap<String, String> {
        split_peer_ids(edge_id)
            .iter()
            .map(|peer| self.peer_id(peer, peers))
            .filter_map(|rewritten| Some((parse_package_id(&rewritten)?.0, rewritten)))
            .collect()
    }

    /// `rewritePeerId`.
    fn peer_id(&self, peer: &str, peers: Option<&Map<String, Value>>) -> String {
        let nested = self.peer_dependencies(without_peer_suffix(peer));
        let peer_ids: Vec<String> = split_peer_ids(peer)
            .iter()
            .map(|nested_peer| self.peer_id(nested_peer, nested))
            .collect();
        let mut base = without_peer_suffix(peer).to_owned();
        if let Some((name, _)) = parse_package_id(peer) {
            let best = match peers
                .and_then(|peers| peers.get(&name))
                .and_then(Value::as_str)
            {
                Some(range) => self.best_compatible(&name, range),
                None => self.versions
                    .get(&name)
                    .and_then(|versions| versions.first().cloned()),
            };
            if let Some(version) = best {
                base = format!("{name}@{version}");
            }
        }
        format!("{base}{}", create_peer_suffix(&peer_ids))
    }

    /// `rewritePeerDep`.
    fn peer_dependency(
        &self,
        dependency: &str,
        peers: Option<&Map<String, Value>>,
        peer_ids_by_name: &HashMap<String, String>,
    ) -> String {
        let parsed = parse_package_id(dependency);
        if let Some(peer) =
            peer_ids_by_name.get(parsed.as_ref().map_or("", |(name, _)| name.as_str()))
        {
            return peer.clone();
        }
        let (Some(peers), Some((name, _))) = (peers, parsed) else { return dependency.to_owned() };
        let Some(range) = peers.get(&name).and_then(Value::as_str) else {
            return dependency.to_owned();
        };
        self.best_compatible(&name, range)
            .map_or_else(|| dependency.to_owned(), |version| format!("{name}@{version}"))
    }

    /// `rewriteNodeId`.
    fn node_id(&self, node: &str) -> String {
        let package = without_peer_suffix(node);
        let peers = self.peer_dependencies(package);
        let peer_ids = split_peer_ids(node);
        if peer_ids.is_empty() {
            return node.to_owned();
        }
        let rewritten: Vec<String> = peer_ids
            .iter()
            .map(|peer| self.peer_id(peer, peers))
            .collect();
        if rewritten == peer_ids {
            return node.to_owned();
        }
        format!("{package}{}", create_peer_suffix(&rewritten))
    }

    /// `getBestCompatiblePeer`: `semver.satisfies(version, range, { includePrerelease: true })`.
    fn best_compatible(&self, name: &str, range: &str) -> Option<String> {
        self.versions
            .get(name)?
            .iter()
            .find(|version| semver::satisfies_including_prerelease(version, range))
            .cloned()
    }
}

/// `mergeNeighbours`: neighbours of a duplicate edge join by id.
fn merge_neighbours(existing: &mut Value, incoming: &Value) {
    let Some(target) = existing["neighbours"].as_array_mut() else { return };
    for neighbour in incoming["neighbours"]
        .as_array()
        .into_iter()
        .flatten()
    {
        if !target
            .iter()
            .any(|current| id(current) == id(neighbour))
        {
            target.push(neighbour.clone());
        }
    }
}

/// `collectVersionsByPackageName`.
fn collect_versions(graph: &Value) -> Versions {
    let mut versions = Versions::new();
    for package in packages(graph).keys() {
        add_version(&mut versions, package);
    }
    for edge in edges(graph) {
        add_version(&mut versions, id(edge));
        for neighbour in edge["neighbours"]
            .as_array()
            .into_iter()
            .flatten()
        {
            add_version(&mut versions, id(neighbour));
        }
    }
    for list in versions.values_mut() {
        list.sort_by(|left, right| compare(right, left));
    }
    versions
}

fn add_version(versions: &mut Versions, package: &str) {
    if let Some((name, version)) = parse_package_id(package)
        && SemVer::parse(&version).is_ok()
    {
        versions
            .entry(name)
            .or_default()
            .push(version);
    }
    for peer in split_peer_ids(package) {
        add_version(versions, &peer);
    }
}

fn compare(left: &str, right: &str) -> std::cmp::Ordering {
    match (SemVer::parse(left), SemVer::parse(right)) {
        (Ok(left), Ok(right)) => left.compare(&right),
        _ => std::cmp::Ordering::Equal,
    }
}

/// `parsePkgId`: `name@version` without the peer suffix.
pub fn parse_package_id(package: &str) -> Option<(String, String)> {
    let base = without_peer_suffix(package);
    let at = base.rfind('@').filter(|at| *at > 0)?;
    let (name, version) = (base[..at].trim(), base[at + 1..].trim());
    (!name.is_empty() && !version.is_empty()).then(|| (name.to_owned(), version.to_owned()))
}

/// `getVersionFromNodeId`: a valid or coerced semver.
pub fn version_of(node: &str) -> Option<String> {
    let base = without_peer_suffix(node);
    let version = base[base.rfind('@')? + 1..].trim();
    if SemVer::parse(version).is_ok() { Some(version.to_owned()) } else { semver::coerce(version) }
}

/// `nodeIdWithoutPeerSuffix`.
pub fn without_peer_suffix(node: &str) -> &str {
    let node = node.trim();
    node.find('(')
        .map_or(node, |start| node[..start].trim())
}

/// `splitPeerIds`: the top-level parenthesized segments.
pub fn split_peer_ids(node: &str) -> Vec<String> {
    let Some(start) = node.find('(') else { return Vec::new() };
    let mut peers = Vec::new();
    let mut depth = 0_usize;
    let mut segment_start = start + 1;
    for (index, character) in node[start..]
        .char_indices()
        .map(|(index, character)| (index + start, character))
    {
        match (character, depth) {
            ('(', 0) => {
                segment_start = index + 1;
                depth = 1;
            }
            ('(', _) => depth += 1,
            (')', 1) => {
                let peer = node[segment_start..index].trim();
                if !peer.is_empty() {
                    peers.push(peer.to_owned());
                }
                depth = 0;
            }
            (')', _) => depth = depth.saturating_sub(1),
            _ => {}
        }
    }
    peers
}

/// `createPeerSuffix`: patch hashes first, then the sorted peers.
fn create_peer_suffix(peer_ids: &[String]) -> String {
    let (patches, mut peers): (Vec<&String>, Vec<&String>) = peer_ids
        .iter()
        .partition(|peer| peer.starts_with("patch_hash="));
    peers.sort();
    let mut suffix = String::new();
    for peer in patches.into_iter().chain(peers) {
        suffix.push('(');
        suffix.push_str(peer);
        suffix.push(')');
    }
    suffix
}
