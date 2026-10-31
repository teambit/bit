use super::{super::resolve_dependencies::Budget, PathMap, Request, Row, invalid};
use serde_json::{Map, Value, json};
use std::{collections::HashMap, io};

#[derive(Default)]
struct Receipts {
    origins: Vec<usize>,
    first: HashMap<String, usize>,
    bytes: usize,
    steps: usize,
}
#[derive(Default)]
struct Replay {
    visited: Map<String, Value>,
    added: Map<String, Value>,
    path_map: Vec<Value>,
    diagnostics: Diagnostics,
    npm: HashMap<String, Vec<String>>,
    registered: Vec<String>,
    scanned: Vec<String>,
    receipts: Receipts,
}
#[derive(Default)]
struct Diagnostics {
    missing: Map<String, Value>,
    missing_packages: Map<String, Value>,
    errors: Map<String, Value>,
}
pub(super) fn finish(
    request: &Request,
    rows: &HashMap<String, Row>,
    budget: &Budget,
) -> io::Result<Value> {
    let mut replay =
        Replay { visited: request.visited.clone().unwrap_or_default(), ..Replay::default() };
    let mut tree = Map::new();
    for root in &request.files {
        let root = root
            .to_str()
            .map(str::trim)
            .filter(|root| !root.is_empty())
            .ok_or_else(|| invalid("dependency graph root encoding"))?;
        if tree.contains_key(root)
            || budget
                .metadata(std::path::Path::new(root))?
                .is_none()
        {
            continue;
        }
        if request.visited.is_none() {
            replay.visited.clear();
            replay.receipts.first.clear();
        }
        tree.extend(replay.root(root, rows, request.include_npm)?);
    }
    replay.output(tree)
}
impl Replay {
    fn root(
        &mut self,
        root: &str,
        rows: &HashMap<String, Row>,
        include_npm: bool,
    ) -> io::Result<Map<String, Value>> {
        let mut tree = Map::new();
        let mut stack = vec![root.to_owned()];
        while let Some(file) = stack.pop() {
            self.step()?;
            if self.visited.contains_key(&file) {
                self.cached(file, &mut tree)?;
            } else {
                let row = rows
                    .get(&file)
                    .ok_or_else(|| invalid("dependency graph missing captured file"))?;
                let dependencies = self.fresh(row, include_npm)?;
                tree.insert(file, json!(dependencies));
                stack.extend(dependencies);
            }
        }
        Ok(tree)
    }
    fn cached(&mut self, file: String, tree: &mut Map<String, Value>) -> io::Result<()> {
        let mut stack = vec![file];
        while let Some(file) = stack.pop() {
            self.step()?;
            let Some(cached) = self.visited.get(&file).cloned() else { continue };
            let row: PathMap =
                serde_json::from_value(cached["pathMap"].clone()).map_err(io::Error::other)?;
            let dependencies: Vec<_> = row.dependencies
                .iter()
                .map(|dep| dep.resolved_dep.clone())
                .collect();
            tree.insert(file.clone(), json!(dependencies));
            self.record(&file, cached["pathMap"].clone(), false)?;
            self.diagnostics.cached(&file, &cached);
            for dependency in dependencies {
                if !tree.contains_key(&dependency) {
                    stack.push(dependency);
                }
            }
        }
        Ok(())
    }
    fn fresh(&mut self, row: &Row, include_npm: bool) -> io::Result<Vec<String>> {
        let file = &row.path_map.file;
        if row.detector_scanned {
            self.scanned.push(file.clone());
        }
        let mut dependencies = Vec::new();
        for dep in &row.path_map.dependencies {
            if dep.resolved_dep.contains("node_modules") {
                if include_npm {
                    self.npm
                        .entry(file.clone())
                        .or_default()
                        .push(dep.resolved_dep.clone());
                }
            } else {
                dependencies.push(dep.resolved_dep.clone());
            }
        }
        let value = serde_json::to_value(&row.path_map).map_err(io::Error::other)?;
        self.record(file, value.clone(), true)?;
        let mut cache = json!({"pathMap":value});
        self.record_diagnostics(row, &mut cache);
        self.visited.insert(file.clone(), cache.clone());
        self.added.insert(file.clone(), cache);
        self.registered.extend(row.registered.iter().cloned());
        Ok(dependencies)
    }
    fn record_diagnostics(&mut self, row: &Row, cache: &mut Value) {
        let file = &row.path_map.file;
        if let Some(error) = &row.error {
            self.diagnostics.errors.insert(file.clone(), error.clone());
            cache["error"] = error.clone();
        }
        if !row.missing.is_empty() {
            let missing = json!(row.missing);
            self.diagnostics.missing.insert(file.clone(), missing.clone());
            cache["missing"] = missing;
        }
        if !row.missing_packages.is_empty() {
            let missing = json!(row.missing_packages);
            self.diagnostics.missing_packages.insert(file.clone(), missing.clone());
            cache["missingPackages"] = missing;
        }
    }
    fn record(&mut self, file: &str, value: Value, fresh: bool) -> io::Result<()> {
        self.receipts.bytes += serde_json::to_vec(&value).map_err(io::Error::other)?.len();
        if self.receipts.bytes > 8 * 1024 * 1024 {
            return Err(invalid("dependency graph replay output limit"));
        }
        if fresh {
            self.receipts.first.insert(file.to_owned(), self.path_map.len());
        }
        let first = self.receipts.first.entry(file.to_owned()).or_insert(self.path_map.len());
        self.receipts.origins.push(*first);
        self.path_map.push(value);
        Ok(())
    }
    fn step(&mut self) -> io::Result<()> {
        self.receipts.steps += 1;
        if self.receipts.steps > 65536 {
            return Err(invalid("dependency graph traversal budget"));
        }
        Ok(())
    }
    fn output(self, mut tree: Map<String, Value>) -> io::Result<Value> {
        for (file, paths) in self.npm {
            if let Some(dependencies) = tree.get_mut(&file).and_then(Value::as_array_mut) {
                dependencies.extend(paths.into_iter().map(Value::String));
            }
        }
        Ok(
            json!({"tree":tree,"pathMap":self.path_map,"pathMapOrigins":self.receipts.origins,"missing":self.diagnostics.missing,"missingPackages":self.diagnostics.missing_packages,"errors":self.diagnostics.errors,"visited":self.added,"registeredPaths":self.registered,"scannedPaths":self.scanned}),
        )
    }
}
impl Diagnostics {
    fn cached(&mut self, file: &str, cached: &Value) {
        if let Some(value) = cached.get("missing") {
            self.missing.insert(file.to_owned(), value.clone());
        }
        if let Some(value) = cached.get("missingPackages") {
            self.missing_packages.insert(file.to_owned(), value.clone());
        }
    }
}
