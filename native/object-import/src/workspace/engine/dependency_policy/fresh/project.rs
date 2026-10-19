mod component;
mod output;
mod peer;
mod relative;

use super::{
    invalid,
    packages::{Package, Reader},
    wire::{ComponentVersion, Detect},
};
use crate::workspace::engine::{resolve_dependencies::normalize, source_overlay::SourceOverlay};
use serde_json::{Map, Value, json};
use std::{io, path::Path};

pub(super) fn project(
    request: &Detect,
    graph: &Value,
    overlay: Option<&SourceOverlay>,
) -> io::Result<Value> {
    let proofs = serde_json::from_value(graph["readSet"].clone()).map_err(io::Error::other)?;
    let mut projection = Projection {
        request,
        graph,
        reader: Reader::new(&request.component_root, proofs, overlay)?,
        dependencies: Default::default(),
        packages: Default::default(),
        versions: Vec::new(),
        grammar: Vec::new(),
        metadata: Metadata::default(),
    };
    // The workspace-root is never installed or built. Canonical dependency loading
    // skips its source imports; explicit resolver policy is applied by the next stage.
    if request.component_root != request.root {
        for file in &request.files {
            projection.file(file)?;
        }
    }
    projection.finish()
}
struct Projection<'a> {
    request: &'a Detect,
    graph: &'a Value,
    reader: Reader,
    dependencies: [Vec<Value>; 3],
    packages: [Map<String, Value>; 3],
    versions: Vec<ComponentVersion>,
    grammar: Vec<String>,
    metadata: Metadata,
}
#[derive(Default)]
struct Metadata {
    issues: IssueData,
    core_aspects: Vec<String>,
    file_core_aspects: [Vec<String>; 2],
    relative: relative::State,
}
#[derive(Default)]
struct IssueData {
    missing_files: Map<String, Value>,
    directory_imports: Map<String, Value>,
    missing_packages: Vec<Value>,
    parse_errors: Map<String, Value>,
    self_reference: Map<String, Value>,
    non_main: Map<String, Value>,
}
impl Projection<'_> {
    fn file(&mut self, file: &Path) -> io::Result<()> {
        self.metadata.file_core_aspects.iter_mut().for_each(Vec::clear);
        let path = file.to_str().ok_or_else(|| invalid("fresh source path"))?;
        let relative = file
            .strip_prefix(&self.request.component_root)
            .map_err(io::Error::other)?
            .to_str()
            .ok_or_else(|| invalid("fresh relative path"))?
            .replace(std::path::MAIN_SEPARATOR, "/");
        let field = usize::from(
            self.request.detection.dev_files
                .iter()
                .any(|dev| dev == &relative),
        );
        let mut edges: Vec<String> =
            serde_json::from_value(self.graph["tree"][path].clone()).map_err(io::Error::other)?;
        edges.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
        self.metadata.relative.processed.insert(path.to_owned());
        let mut packages = Map::new();
        let mut components = Vec::new();
        for edge in edges {
            self.edge(path, edge, &mut packages, &mut components, field)?;
        }
        self.finish_core_aspects();
        self.error(path, &relative)?;
        self.missing(path, &relative)?;
        self.missing_packages(path, &relative, field, &mut packages)?;
        self.packages(&relative, field, packages)?;
        for (package, edge) in components {
            self.component(package, &edge, field, &relative)?;
        }
        Ok(())
    }
    fn error(&mut self, path: &str, relative: &str) -> io::Result<()> {
        let error = &self.graph["errors"][path];
        if error.is_null() {
            return Ok(());
        }
        let message = error["message"].as_str().ok_or_else(|| invalid("parser error message"))?;
        let location = match (error["lineNumber"].as_u64(), error["column"].as_u64()) {
            (Some(line), Some(column)) if line > 0 && column > 0 => {
                format!(" (line: {line}, column: {column})")
            }
            _ => String::new(),
        };
        self.metadata.issues.parse_errors.insert(
            relative.to_owned(),
            json!(format!("{message}{location}")),
        );
        Ok(())
    }

    fn edge(
        &mut self,
        origin: &str,
        edge: String,
        packages: &mut Map<String, Value>,
        components: &mut Vec<(Package, String)>,
        field: usize,
    ) -> io::Result<()> {
        if !edge.replace(std::path::MAIN_SEPARATOR, "/").contains("node_modules/") {
            return self.relative(origin, &edge, field);
        }
        let package = self.reader.package(&edge)?;
        if self.core_aspect(&package.name, package.component.is_some())? {
            return Ok(());
        }
        if package.component.is_some() {
            components.push((package, edge));
        } else {
            let version = package.dependent
                .or(package.concrete)
                .ok_or_else(|| invalid("fresh package version absent"))?;
            packages.insert(package.name, Value::String(version));
        }
        Ok(())
    }
    fn core_aspect(&mut self, name: &str, component: bool) -> io::Result<bool> {
        let detection = &self.request.detection;
        if detection.core_aspect_ids.contains(&unversioned(&self.request.identity).to_owned()) {
            return Ok(false);
        }
        let Some(index) = detection.core_packages
            .iter()
            .position(|package| package == name)
        else {
            return Ok(false);
        };
        let id = detection.core_aspect_ids
            .get(index)
            .ok_or_else(|| invalid("fresh core aspect identity mapping"))?;
        self.metadata.file_core_aspects[usize::from(component)].push(id.clone());
        Ok(true)
    }

    fn finish_core_aspects(&mut self) {
        // AutoDetectDeps processes unidentified packages before component packages,
        // then deduplicates only this origin file's combined list.
        let mut seen = Vec::new();
        for id in self.metadata.file_core_aspects.iter().flatten() {
            if !seen.contains(id) {
                seen.push(id.clone());
            }
        }
        self.metadata.core_aspects.extend(seen);
    }

    fn relative(&mut self, origin: &str, edge: &str, field: usize) -> io::Result<()> {
        if origin == edge {
            return Ok(());
        }
        if !self.request.files
            .iter()
            .any(|file| file == Path::new(edge))
        {
            return self.external_relative(origin, edge, field);
        }
        let dependency = relative::dependency(self.graph, origin, edge)?;
        let source =
            dependency["importSource"].as_str().ok_or_else(|| invalid("fresh relative import"))?;
        if source == "." || source.ends_with("/..") {
            let file = self.relative_name(origin)?;
            self.metadata.issues.directory_imports
                .entry(file)
                .or_insert_with(|| json!([]))
                .as_array_mut()
                .ok_or_else(|| invalid("fresh directory issue"))?
                .push(json!(source));
        }
        Ok(())
    }
    fn relative_name(&self, origin: &str) -> io::Result<String> {
        relative::path(&self.request.component_root, Path::new(origin))
    }
    fn missing(&mut self, origin: &str, relative: &str) -> io::Result<()> {
        let Some(specifiers) = self.graph["missing"][origin].as_array() else { return Ok(()) };
        let base = Path::new(origin).parent().ok_or_else(|| invalid("fresh missing origin"))?;
        let missing = specifiers
            .iter()
            .map(|specifier| {
                let name = specifier.as_str().ok_or_else(|| invalid("fresh missing specifier"))?;
                if !name.starts_with('.') {
                    return Err(invalid("fresh missing package requires canonical fallback"));
                }
                let candidate = normalize(&base.join(name)).with_extension("");
                let same_file_different_extension = Path::new(name).extension().is_some()
                    && self.request.files
                        .iter()
                        .any(|file| file.with_extension("") == candidate);
                Ok((!same_file_different_extension).then(|| name.to_owned()))
            })
            .collect::<io::Result<Vec<_>>>()?;
        let missing: Vec<_> = missing.into_iter().flatten().collect();
        if !missing.is_empty() {
            self.metadata.issues.missing_files.insert(relative.to_owned(), json!(missing));
        }
        Ok(())
    }
    fn missing_packages(
        &mut self,
        origin: &str,
        relative: &str,
        field: usize,
        packages: &mut Map<String, Value>,
    ) -> io::Result<()> {
        let Some(names) = self.graph["missingPackages"][origin].as_array() else {
            return Ok(());
        };
        let mut missing = Vec::new();
        for name in names {
            let name = name.as_str().ok_or_else(|| invalid("fresh missing package name"))?;
            if let Some(version) = self.request.detection.model_packages[0]
                .get(name)
                .or_else(|| self.request.detection.model_packages[1].get(name))
            {
                packages.insert(name.to_owned(), version.clone());
            } else {
                missing.push(name.to_owned());
            }
        }
        if !missing.is_empty() {
            self.metadata.issues.missing_packages.push(json!({
                "filePath":relative,
                "missingPackages":missing,
                "isDevFile":field == 1,
            }));
        }
        Ok(())
    }
    fn packages(
        &mut self,
        origin: &str,
        field: usize,
        mut packages: Map<String, Value>,
    ) -> io::Result<()> {
        for (name, version) in &mut packages {
            if !self.request.detection.workspace_policy[0].contains_key(name)
                && let Some(model) = self.request.detection.model_packages[1]
                    .get(name)
                    .or_else(|| self.request.detection.model_packages[0].get(name))
            {
                *version = model.clone();
            }
            if matches!(
                Path::new(origin).extension().and_then(|value| value.to_str()),
                Some("ts" | "tsx"),
            ) {
                self.types(name)?;
            }
        }
        self.packages[field].extend(packages);
        Ok(())
    }
    fn types(&mut self, name: &str) -> io::Result<()> {
        let escaped = match name
            .strip_prefix('@')
            .and_then(|rest| rest.split_once('/'))
        {
            Some((scope, package))
                if scope
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-')) =>
            {
                format!("{scope}__{package}")
            }
            _ => name.to_owned(),
        };
        let typed = format!("@types/{escaped}");
        let version = self.request.detection.workspace_policy
            .iter()
            .find_map(|field| field.get(&typed))
            .or_else(|| self.request.detection.model_packages[1].get(&typed));
        if let Some(version) = version {
            if !version.is_string() {
                return Err(invalid("fresh type package version"));
            }
            self.packages[1].insert(typed, version.clone());
        }
        Ok(())
    }
}

fn identity(id: &Value) -> io::Result<String> {
    let scope = id["scope"]
        .as_str()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| invalid("fresh component scope"))?;
    let name = id["name"]
        .as_str()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| invalid("fresh component name"))?;
    Ok(format!("{scope}/{name}"))
}
fn unversioned(id: &str) -> &str {
    id.rsplit_once('@').map_or(id, |(base, _)| base)
}
