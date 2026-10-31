//! Version reachability graph and dependency expansion for `bit gc`.

pub(super) mod models;

pub(super) use models::version_refs_without_parents;

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
    pub models: models::Models,
    pub remote_refs_per_comp: HashMap<String, Vec<String>>,
    pub remote_refs: HashSet<String>,
    pub root_versions: HashSet<String>,
}

impl GcGraph {
    pub fn new(inv: &ScopeInventory) -> Self {
        let mut version_map = HashMap::new();
        for obj in &inv.objects {
            if obj.kind == "Version" {
                version_map.insert(obj.hash.clone(), obj.value.clone());
            }
        }
        Self {
            version_map,
            models: models::Models::new(inv),
            remote_refs_per_comp: inv.roots.remote_refs_per_comp.clone(),
            remote_refs: inv.roots.remote_refs.clone(),
            root_versions: HashSet::new(),
        }
    }

    pub fn add_root(&mut self, hash: &str) {
        let hash = hash.trim();
        if self.version_map.contains_key(hash) {
            self.root_versions.insert(hash.to_owned());
        }
    }

    pub fn add_new_root(&mut self, hash: &str) -> bool {
        let hash = hash.trim();
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
        self.models.get(scope, name)
    }
}

pub(super) fn comp_value_key(comp: &Value) -> String {
    if let Some(id_str) = comp.as_str() {
        let trimmed = id_str.trim();
        return trimmed
            .split('@')
            .next()
            .unwrap_or(trimmed)
            .trim()
            .to_owned();
    }
    let scope = comp["scope"].as_str().map_or("", str::trim);
    let name = comp["name"].as_str().map_or("", str::trim);
    if scope.is_empty() { name.to_owned() } else { format!("{scope}/{name}") }
}

pub(super) fn resolve_comp_version_ref(comp: &Value, ver: &str) -> Option<String> {
    if matches!(ver, "latest" | "head") {
        return comp["head"]
            .as_str()
            .filter(|val| !val.is_empty())
            .map(str::to_owned);
    }
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
        return Some(parse_dep_str(str_val));
    }
    let id_obj = val
        .get("id")
        .filter(|id| id.is_object())
        .unwrap_or(val);
    let raw_name = id_obj.get("name").and_then(Value::as_str)?;
    let (name_str, inline_ver) = raw_name
        .rsplit_once('@')
        .map_or((raw_name, None), |(nm, ver)| (nm, Some(ver)));
    let scope = id_obj
        .get("scope")
        .and_then(Value::as_str)
        .filter(|sc| !sc.is_empty())
        .map(str::to_owned);
    let version = id_obj
        .get("version")
        .and_then(Value::as_str)
        .or_else(|| val.get("version").and_then(Value::as_str))
        .or_else(|| id_obj.get("head").and_then(Value::as_str))
        .or_else(|| val.get("head").and_then(Value::as_str))
        .or(inline_ver)
        .filter(|ver| !ver.is_empty())
        .map(str::to_owned);
    Some(CompIdSpec { scope, name: name_str.to_owned(), version })
}

fn parse_dep_str(str_val: &str) -> CompIdSpec {
    let (id_part, version) = str_val
        .rsplit_once('@')
        .map_or((str_val, None), |(id, ver)| (id, Some(ver.to_owned())));
    let (scope, name) = id_part
        .split_once('/')
        .map_or_else(
            || (None, id_part.to_owned()),
            |(sc, nm)| (Some(sc.to_owned()), nm.to_owned()),
        );
    CompIdSpec { scope, name, version }
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
        let Ok(Value::Array(items)) = bit_object_import::parse_jsonc(&body) else {
            return Vec::new();
        };
        return items
            .iter()
            .filter_map(parse_dep_value)
            .collect();
    }
    let mut specs = Vec::new();
    for field in ["flattenedDependencies", "flattenedDevDependencies"] {
        if let Some(arr) = ver_val[field].as_array() {
            specs.extend(arr.iter().filter_map(parse_dep_value));
        }
    }
    specs
}
