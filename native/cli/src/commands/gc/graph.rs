//! Version reachability graph and dependency expansion for `bit gc`.

use super::inventory::ScopeInventory;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet, VecDeque},
    path::Path,
};

#[derive(Debug, Clone)]
pub(super) struct CompIdSpec {
    pub scope: Option<String>,
    pub name: String,
    pub version: Option<String>,
}

pub(super) struct GcGraph {
    pub version_map: HashMap<String, Value>,
    pub comp_map: HashMap<String, Value>,
    pub remote_refs_per_comp: HashMap<String, Vec<String>>,
    pub remote_refs: HashSet<String>,
    pub root_versions: HashSet<String>,
}

impl GcGraph {
    pub fn new(inv: &ScopeInventory) -> Self {
        let mut version_map = HashMap::new();
        let mut comp_map = HashMap::new();
        for obj in &inv.objects {
            if obj.kind == "Version" {
                version_map.insert(obj.hash.clone(), obj.value.clone());
            } else if obj.kind == "Component" {
                insert_comp_entry(&mut comp_map, &obj.value);
            }
        }
        Self {
            version_map,
            comp_map,
            remote_refs_per_comp: inv.roots.remote_refs_per_comp.clone(),
            remote_refs: inv.roots.remote_refs.clone(),
            root_versions: HashSet::new(),
        }
    }

    pub fn add_root(&mut self, hash: &str) {
        if self.version_map.contains_key(hash) {
            self.root_versions.insert(hash.to_owned());
        }
    }

    pub fn add_new_root(&mut self, hash: &str) -> bool {
        if self.root_versions.contains(hash) || !self.version_map.contains_key(hash) {
            return false;
        }
        self.root_versions.insert(hash.to_owned());
        true
    }

    pub fn keep_ancestry_of(&mut self, start_hashes: &[String], stop_at_remote: bool) {
        let mut seen = HashSet::new();
        let mut stack = start_hashes.to_vec();
        while let Some(hash) = stack.pop() {
            if !seen.insert(hash.clone()) || !self.version_map.contains_key(&hash) {
                continue;
            }
            self.add_root(&hash);
            if stop_at_remote && self.remote_refs.contains(&hash) {
                continue;
            }
            if let Some(ver_val) = self.version_map.get(&hash) {
                stack.extend(version_parents(ver_val));
            }
        }
    }

    pub fn keep_history_of(
        &mut self,
        starts: &[(String, String)],
        stop_at_remote: bool,
        limit: usize,
    ) {
        for (comp_key, head) in starts {
            if head.is_empty() {
                continue;
            }
            let stop_set: HashSet<&str> = if stop_at_remote {
                self.remote_refs_per_comp
                    .get(comp_key)
                    .map(|vec| vec.iter().map(String::as_str).collect())
                    .unwrap_or_default()
            } else {
                HashSet::new()
            };
            if stop_set.contains(head.as_str()) {
                continue;
            }
            for ver_hash in self.walk_version_bfs(head, &stop_set, limit) {
                self.add_root(&ver_hash);
            }
        }
    }

    fn walk_version_bfs(
        &self,
        start_head: &str,
        stop_set: &HashSet<&str>,
        limit: usize,
    ) -> Vec<String> {
        let mut results = vec![start_head.to_owned()];
        let mut processed = HashSet::from([start_head.to_owned()]);
        let mut queue = VecDeque::new();
        if self.version_map.contains_key(start_head) {
            queue.push_back(start_head.to_owned());
        }
        while let Some(cur_hash) = queue.pop_front() {
            if results.len() >= limit {
                break;
            }
            let Some(ver_val) = self.version_map.get(&cur_hash) else { continue };
            self.enqueue_parents(
                ver_val,
                stop_set,
                limit,
                (&mut results, &mut processed, &mut queue),
            );
        }
        results.truncate(limit);
        results
    }

    fn enqueue_parents(
        &self,
        ver_val: &Value,
        stop_set: &HashSet<&str>,
        limit: usize,
        state: (&mut Vec<String>, &mut HashSet<String>, &mut VecDeque<String>),
    ) {
        let (results, processed, queue) = state;
        for parent in version_parents(ver_val) {
            if stop_set.contains(parent.as_str()) || !processed.insert(parent.clone()) {
                continue;
            }
            results.push(parent.clone());
            if results.len() >= limit {
                break;
            }
            if self.version_map.contains_key(&parent) {
                queue.push_back(parent);
            }
        }
    }

    pub fn expand_referenced(&mut self, scope_dir: &Path) -> HashSet<String> {
        let mut kept = HashSet::new();
        let mut seen_deps = HashSet::new();
        let mut frontier: Vec<String> = self.root_versions
            .iter()
            .cloned()
            .collect();
        while !frontier.is_empty() {
            let mut dep_specs = Vec::new();
            let mut added = Vec::new();
            for hash in &frontier {
                self.expand_one_version(scope_dir, hash, (&mut kept, &mut dep_specs, &mut added));
            }
            self.resolve_unseen_deps(dep_specs, &mut seen_deps, &mut added);
            frontier = added;
        }
        kept
    }

    fn expand_one_version(
        &mut self,
        scope_dir: &Path,
        hash: &str,
        accum: (&mut HashSet<String>, &mut Vec<CompIdSpec>, &mut Vec<String>),
    ) {
        let (kept, dep_specs, added) = accum;
        let Some(ver_val) = self.version_map.get(hash).cloned() else { return };
        kept.insert(hash.to_owned());
        kept.extend(version_refs_without_parents(&ver_val));
        dep_specs.extend(version_dependencies(scope_dir, &ver_val));
        if let Some(unrel_head) = ver_val["unrelated"]["head"].as_str()
            && self.add_new_root(unrel_head)
        {
            added.push(unrel_head.to_owned());
        }
    }

    fn resolve_unseen_deps(
        &mut self,
        dep_specs: Vec<CompIdSpec>,
        seen_deps: &mut HashSet<String>,
        added: &mut Vec<String>,
    ) {
        for dep in dep_specs {
            let dep_key = format!("{:?}:{}:{:?}", dep.scope, dep.name, dep.version);
            if !seen_deps.insert(dep_key) {
                continue;
            }
            for cand in self.resolve_dep_hashes(&dep) {
                if self.add_new_root(&cand) {
                    added.push(cand);
                }
            }
        }
    }

    fn resolve_dep_hashes(&self, dep: &CompIdSpec) -> Vec<String> {
        let mut out = Vec::new();
        let Some(ver) = dep.version
            .as_deref()
            .filter(|val| !val.is_empty())
        else {
            return out;
        };
        out.push(ver.to_owned());
        if let Some(comp) = self.find_comp(dep.scope.as_deref(), &dep.name)
            && let Some(resolved) = resolve_comp_version_ref(comp, ver)
        {
            out.push(resolved);
        }
        out
    }

    pub fn find_comp(&self, scope: Option<&str>, name: &str) -> Option<&Value> {
        if let Some(scope_str) = scope.filter(|val| !val.is_empty()) {
            let full = format!("{scope_str}/{name}");
            if let Some(comp) = self.comp_map.get(&full) {
                return Some(comp);
            }
        }
        self.comp_map.get(name)
    }
}

pub(super) fn comp_value_key(comp: &Value) -> String {
    let scope = comp["scope"].as_str().unwrap_or("");
    let name = comp["name"].as_str().unwrap_or("");
    if scope.is_empty() { name.to_owned() } else { format!("{scope}/{name}") }
}

pub(super) fn resolve_comp_version_ref(comp: &Value, ver: &str) -> Option<String> {
    comp["versions"]
        .get(ver)
        .and_then(Value::as_str)
        .or_else(|| comp["orphanedVersions"].get(ver).and_then(Value::as_str))
        .map(str::to_owned)
        .or_else(|| {
            (ver.len() == 40 && ver.bytes().all(|byte| byte.is_ascii_hexdigit())).then(|| {
                ver.to_owned()
            })
        })
}

pub(super) fn parse_dep_value(val: &Value) -> Option<CompIdSpec> {
    if let Some(str_val) = val.as_str() {
        let (id_part, version) = str_val
            .rsplit_once('@')
            .map_or((str_val, None), |(id, ver)| (id, Some(ver.to_owned())));
        let (scope, name) = id_part
            .split_once('/')
            .map_or_else(
                || (None, id_part.to_owned()),
                |(sc, nm)| (Some(sc.to_owned()), nm.to_owned()),
            );
        return Some(CompIdSpec { scope, name, version });
    }
    let name = val
        .get("name")
        .and_then(Value::as_str)?
        .to_owned();
    let scope = val
        .get("scope")
        .and_then(Value::as_str)
        .filter(|sc| !sc.is_empty())
        .map(str::to_owned);
    let version = val
        .get("version")
        .and_then(Value::as_str)
        .filter(|ver| !ver.is_empty())
        .map(str::to_owned);
    Some(CompIdSpec { scope, name, version })
}

fn insert_comp_entry(comp_map: &mut HashMap<String, Value>, val: &Value) {
    let key = comp_value_key(val);
    if !key.is_empty() {
        comp_map.insert(key, val.clone());
    }
    if let Some(name) = val["name"].as_str()
        && !comp_map.contains_key(name)
    {
        comp_map.insert(name.to_owned(), val.clone());
    }
}

fn version_parents(ver_val: &Value) -> Vec<String> {
    ver_val["parents"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

pub(super) fn version_refs_without_parents(ver_val: &Value) -> Vec<String> {
    let mut refs = Vec::new();
    collect_file_refs(&ver_val["files"], &mut refs);
    if let Some(exts) = ver_val["extensions"].as_array() {
        for ext in exts {
            collect_artifact_refs(&ext["artifacts"], &mut refs);
            collect_artifact_refs(&ext["data"]["artifacts"], &mut refs);
        }
    }
    for field in ["flattenedEdgesRef", "dependenciesGraphRef", "flattenedDependenciesRef"] {
        if let Some(hash) = ver_val[field]
            .as_str()
            .filter(|val| !val.is_empty())
        {
            refs.push(hash.to_owned());
        }
    }
    refs
}

fn collect_file_refs(files_val: &Value, refs: &mut Vec<String>) {
    let Some(files) = files_val.as_array() else { return };
    for file in files {
        if let Some(hash) = file["file"]
            .as_str()
            .or_else(|| file["file"]["hash"].as_str())
        {
            refs.push(hash.to_owned());
        }
    }
}

fn collect_artifact_refs(artifacts_val: &Value, refs: &mut Vec<String>) {
    let Some(artifacts) = artifacts_val.as_array() else { return };
    for art in artifacts {
        let Some(arr) = art["files"]["refs"]
            .as_array()
            .or_else(|| art["files"].as_array())
        else {
            continue;
        };
        for item in arr {
            if let Some(hash) = item["ref"]
                .as_str()
                .or_else(|| item["ref"]["hash"].as_str())
                .or_else(|| item["file"].as_str())
            {
                refs.push(hash.to_owned());
            }
        }
    }
}

fn version_dependencies(scope_dir: &Path, ver_val: &Value) -> Vec<CompIdSpec> {
    let mut specs = collect_flattened_deps(scope_dir, ver_val);
    let Some(exts) = ver_val["extensions"].as_array() else { return specs };
    for ext in exts {
        if let Some(spec) = parse_dep_value(&ext["extensionId"]) {
            specs.push(spec);
        }
    }
    specs
}

fn collect_flattened_deps(scope_dir: &Path, ver_val: &Value) -> Vec<CompIdSpec> {
    if let Some(flat_ref) = ver_val["flattenedDependenciesRef"].as_str() {
        let Ok(Some((_, body))) = bit_object_import::read_raw_scope_object(scope_dir, flat_ref)
        else {
            return Vec::new();
        };
        let Ok(Value::Array(items)) = serde_json::from_slice::<Value>(&body) else {
            return Vec::new();
        };
        return items
            .iter()
            .filter_map(parse_dep_value)
            .collect();
    }
    ver_val["flattenedDependencies"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(parse_dep_value)
                .collect()
        })
        .unwrap_or_default()
}
