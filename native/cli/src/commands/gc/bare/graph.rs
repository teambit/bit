//! `collectGarbage`: retain full local/lane history and only the requested flattened dependency versions.
use super::repository::{self, Object, digest, identity, strings, text, unsupported};
use indexmap::IndexSet;
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashSet, VecDeque},
    io,
    path::Path,
};

pub(super) struct Collector<'a> {
    scope: &'a Path,
    name: &'a str,
    objects: &'a BTreeMap<String, Object>,
    lanes: Vec<(String, &'a Value)>,
    retained: HashSet<String>,
    dependencies: IndexSet<String>,
    pub logs: Vec<String>,
    pub verbose: bool,
}
impl<'a> Collector<'a> {
    pub(super) fn new(
        scope: &'a Path,
        name: &'a str,
        objects: &'a BTreeMap<String, Object>,
        trash: &'a BTreeMap<String, Object>,
    ) -> Self {
        let lanes = objects
            .iter()
            .chain(trash)
            .filter(|(_, object)| object.kind == "Lane")
            .map(|(hash, object)| (hash.clone(), &object.value))
            .collect();
        Self {
            scope,
            name,
            objects,
            lanes,
            retained: HashSet::new(),
            dependencies: IndexSet::new(),
            logs: Vec::new(),
            verbose: false,
        }
    }
    pub(super) fn plan(&mut self) -> io::Result<Vec<String>> {
        self.local_components()?;
        self.logs.push(format!(
            "[*] completed processing local components. total {} refs in the white list",
            self.retained.len(),
        ));
        self.foreign_lanes()?;
        self.logs.push(format!(
            "[*] completed processing lanes. total {} refs in the white list",
            self.retained.len(),
        ));
        self.logs.push(format!(
            "[*] start processing {} flattened dependencies",
            self.dependencies.len(),
        ));
        for dependency in self.dependencies.clone() {
            self.dependency(&dependency)?;
        }
        self.logs.push(format!(
            "[*] completed processing {} flattened dependencies. total {} refs in the white list",
            self.dependencies.len(),
            self.retained.len(),
        ));
        Ok(self.objects
            .keys()
            .filter(|hash| !self.retained.contains(*hash))
            .cloned()
            .collect())
    }
    fn local_components(&mut self) -> io::Result<()> {
        for object in self.objects.values() {
            match object.kind.as_str() {
                "ScopeMeta" => {
                    self.retained.insert(digest(text(&object.value["name"])?));
                }
                "Component"
                    if object.value["scope"].as_str().map(str::trim) == Some(self.name.trim()) =>
                {
                    let component = &object.value;
                    self.component(component, component["head"].as_str(), true)?;
                    for head in strings(&component["detachedHeads"]["heads"])? {
                        self.component(component, Some(&head), true)?;
                    }
                }
                _ => {}
            }
        }
        Ok(())
    }
    fn component(&mut self, component: &Value, head: Option<&str>, local: bool) -> io::Result<()> {
        let id = identity(component)?;
        self.retained.insert(digest(&id));
        self.retained.insert(digest(&format!("{id}:VersionHistory")));
        if self.verbose {
            self.logs.push(format!("** processing {id} **"));
        }
        let main = match head {
            Some(head) => self.history(head, !local, &HashSet::new())?,
            None => HashSet::new(),
        };
        let heads = if local { self.local_lane_heads(&id)? } else { Vec::new() };
        let mut count = main.len();
        for head in &heads {
            count += self.history(head, true, &main)?.len();
        }
        if self.verbose {
            self.logs.push(if local {
                format!("total {count} versions, total lanes with this component {}", heads.len())
            } else {
                format!("total {count} versions")
            });
        }
        Ok(())
    }
    fn local_lane_heads(&self, id: &str) -> io::Result<Vec<String>> {
        let mut heads = Vec::new();
        for (hash, lane) in &self.lanes {
            if !self.objects.contains_key(hash) {
                continue;
            }
            heads.extend(
                lane_entries(lane)?
                    .into_iter()
                    .find(|(key, _)| key == id)
                    .map(|(_, head)| head),
            );
        }
        Ok(heads)
    }
    fn history(
        &mut self,
        head: &str,
        tolerate_missing: bool,
        stop: &HashSet<String>,
    ) -> io::Result<HashSet<String>> {
        let mut queue = VecDeque::from([head.to_owned()]);
        let mut seen = HashSet::new();
        let mut loaded = HashSet::new();
        while let Some(hash) = queue.pop_front() {
            if stop.contains(&hash) || !seen.insert(hash.clone()) {
                continue;
            }
            let Some(object) = self.objects.get(&hash) else {
                if tolerate_missing {
                    continue;
                }
                return Err(unsupported("incomplete version ancestry"));
            };
            if object.kind != "Version" {
                return Err(unsupported("non-version ancestry object"));
            }
            loaded.insert(hash.clone());
            self.version(&hash, &object.value);
            queue.extend(strings(&object.value["parents"])?);
            self.dependencies.extend(flattened(self.scope, &object.value)?);
        }
        Ok(loaded)
    }
    fn version(&mut self, hash: &str, version: &Value) {
        self.retained.insert(hash.to_owned());
        self.retained.extend(super::super::graph::version_refs_without_parents(version));
    }
    fn foreign_lanes(&mut self) -> io::Result<()> {
        let foreign = self.retain_lanes()?;
        if self.verbose && foreign.len() > 1 {
            return Err(unsupported("verbose foreign lane report ordering"));
        }
        self.logs.push(format!("[*] total {} components inside lanes", foreign.len()));
        for (id, head) in foreign {
            if let Some(object) = repository::model(self.objects, &id)? {
                self.component(&object.value, Some(&head), false)?;
            }
        }
        Ok(())
    }
    fn retain_lanes(&mut self) -> io::Result<IndexSet<(String, String)>> {
        let mut foreign = IndexSet::new();
        for (hash, lane) in &self.lanes {
            self.retained.insert(hash.clone());
            self.retained.insert(digest(&format!("{hash}:LaneHistory")));
            for (id, head) in lane_entries(lane)? {
                if !id.starts_with(&format!("{}/", self.name)) {
                    foreign.insert((id, head));
                }
            }
        }
        Ok(foreign)
    }
    fn dependency(&mut self, id: &str) -> io::Result<()> {
        let (id, version) =
            id.rsplit_once('@').ok_or_else(|| unsupported("unversioned flattened dependency"))?;
        let Some(model) = repository::model(self.objects, id)? else {
            return Ok(());
        };
        self.retained.insert(digest(&identity(&model.value)?));
        let target = if matches!(version, "" | "latest" | "head") {
            model.value["head"].as_str()
        } else if repository::hash(version) {
            Some(version)
        } else {
            model.value["versions"][version]
                .as_str()
                .or_else(|| model.value["orphanedVersions"][version].as_str())
        };
        if let Some(target) = target
            && let Some(object) = self.objects.get(target)
        {
            if object.kind != "Version" {
                return Err(unsupported("dependency version reference has a non-version object"));
            }
            self.version(target, &object.value);
        }
        Ok(())
    }
}
fn lane_entries(lane: &Value) -> io::Result<Vec<(String, String)>> {
    let mut result = Vec::new();
    for component in
        lane["components"].as_array().ok_or_else(|| unsupported("lane component list"))?
    {
        if let Some(raw) = component.as_str() {
            let (id, head) =
                raw.rsplit_once('@').ok_or_else(|| unsupported("lane string identity"))?;
            result.push((id.to_owned(), head.to_owned()));
        } else {
            result.push((identity(&component["id"])?, text(&component["head"])?.to_owned()));
        }
    }
    for id in strings(&lane["updateDependents"])? {
        let (id, head) = id.rsplit_once('@').ok_or_else(|| unsupported("hidden lane identity"))?;
        result.push((id.to_owned(), head.to_owned()));
    }
    Ok(result)
}
fn flattened(scope: &Path, version: &Value) -> io::Result<Vec<String>> {
    if let Some(hash) = version["flattenedDependenciesRef"]
        .as_str()
        .map(str::trim)
        .filter(|hash| !hash.is_empty())
    {
        let (_, bytes) = bit_object_import::read_raw_scope_object(scope, hash)?
            .ok_or_else(|| unsupported("flattened dependency object missing"))?;
        return flattened_values(&bit_object_import::parse_jsonc(&bytes)?);
    }
    let mut result = flattened_values(&version["flattenedDependencies"])?;
    result.extend(flattened_values(&version["flattenedDevDependencies"])?);
    Ok(result)
}
fn flattened_values(value: &Value) -> io::Result<Vec<String>> {
    if value.is_null() {
        return Ok(Vec::new());
    }
    value
        .as_array()
        .ok_or_else(|| unsupported("flattened dependency array"))?
        .iter()
        .map(flattened_entry)
        .collect()
}

fn flattened_entry(value: &Value) -> io::Result<String> {
    if let Some(raw) = value.as_str() {
        return Ok(raw.to_owned());
    }
    if let Some(id_str) = value["id"].as_str() {
        return flattened_str_id(id_str, value);
    }
    let inner = value
        .get("id")
        .filter(|val| val.is_object())
        .unwrap_or(value);
    let scope = inner
        .get("scope")
        .or_else(|| value.get("scope"))
        .unwrap_or(&Value::Null);
    let raw_name = text(
        inner
            .get("name")
            .or_else(|| value.get("name"))
            .unwrap_or(&Value::Null),
    )?;
    let (name, inline_ver) = raw_name
        .rsplit_once('@')
        .map_or((raw_name, None), |(bare, ver)| (bare, Some(ver).filter(|ver| !ver.is_empty())));
    if name.is_empty() {
        return Err(unsupported("empty flattened dependency name"));
    }
    let ver = flattened_ver(inner, value, inline_ver)?;
    Ok(format!("{}/{name}@{ver}", text(scope)?))
}

fn flattened_str_id(id_str: &str, value: &Value) -> io::Result<String> {
    if id_str.contains('@') {
        return Ok(id_str.to_owned());
    }
    let ver = flattened_ver(value, value, None)?;
    Ok(format!("{id_str}@{ver}"))
}

fn flattened_ver<'a>(
    inner: &'a Value,
    value: &'a Value,
    inline_ver: Option<&'a str>,
) -> io::Result<&'a str> {
    inner
        .get("version")
        .or_else(|| value.get("version"))
        .or_else(|| inner.get("head"))
        .or_else(|| value.get("head"))
        .and_then(Value::as_str)
        .filter(|ver| !ver.is_empty())
        .or(inline_ver)
        .ok_or_else(|| unsupported("missing flattened dependency version"))
}
