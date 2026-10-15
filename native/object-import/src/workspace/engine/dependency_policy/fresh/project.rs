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
        issues: IssueData::default(),
    };
    for file in &request.files {
        projection.file(file)?;
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
    issues: IssueData,
}
#[derive(Default)]
struct IssueData {
    missing_files: Map<String, Value>,
    directory_imports: Map<String, Value>,
    missing_packages: Vec<Value>,
}
impl Projection<'_> {
    fn file(&mut self, file: &Path) -> io::Result<()> {
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
        let mut packages = Map::new();
        let mut components = Vec::new();
        for edge in edges {
            self.edge(path, edge, &mut packages, &mut components)?;
        }
        self.missing(path, &relative)?;
        self.missing_packages(path, &relative, field, &mut packages)?;
        self.packages(&relative, field, packages)?;
        for (package, edge) in components {
            self.component(package, &edge, field)?;
        }
        Ok(())
    }
    fn edge(
        &mut self,
        origin: &str,
        edge: String,
        packages: &mut Map<String, Value>,
        components: &mut Vec<(Package, String)>,
    ) -> io::Result<()> {
        if !edge.replace(std::path::MAIN_SEPARATOR, "/").contains("node_modules/") {
            return self.relative(origin, &edge);
        }
        let package = self.reader.package(&edge)?;
        if self.request.detection.core_packages.contains(&package.name) {
            return Err(invalid("fresh core aspect requires canonical detection"));
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
    fn relative(&mut self, origin: &str, edge: &str) -> io::Result<()> {
        if origin == edge {
            return Ok(());
        }
        if !self.request.files
            .iter()
            .any(|file| file == Path::new(edge))
        {
            return Err(invalid("fresh untracked or relative cross-component dependency"));
        }
        let rows =
            self.graph["pathMap"].as_array().ok_or_else(|| invalid("fresh dependency path map"))?;
        let row = rows
            .iter()
            .find(|row| row["file"] == origin)
            .ok_or_else(|| invalid("fresh origin path map"))?;
        let dependencies =
            row["dependencies"].as_array().ok_or_else(|| invalid("fresh origin dependencies"))?;
        let dependency = dependencies
            .iter()
            .find(|dependency| dependency["resolvedDep"] == edge)
            .ok_or_else(|| invalid("fresh relative dependency"))?;
        let source =
            dependency["importSource"].as_str().ok_or_else(|| invalid("fresh relative import"))?;
        if source == "." || source.ends_with("/..") {
            let file = self.relative_name(origin)?;
            self.issues.directory_imports
                .entry(file)
                .or_insert_with(|| json!([]))
                .as_array_mut()
                .ok_or_else(|| invalid("fresh directory issue"))?
                .push(json!(source));
        }
        Ok(())
    }
    fn relative_name(&self, origin: &str) -> io::Result<String> {
        Ok(Path::new(origin)
            .strip_prefix(&self.request.component_root)
            .map_err(io::Error::other)?
            .to_str()
            .ok_or_else(|| invalid("fresh issue path encoding"))?
            .replace(std::path::MAIN_SEPARATOR, "/"))
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
            self.issues.missing_files.insert(relative.to_owned(), json!(missing));
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
            } else if self.request.detection.workspace_policy
                .iter()
                .any(|policy| policy.contains_key(name))
            {
                return Err(invalid(
                    "fresh missing workspace policy package requires canonical fallback",
                ));
            } else {
                missing.push(name.to_owned());
            }
        }
        if !missing.is_empty() {
            self.issues.missing_packages.push(json!({
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
    fn component(&mut self, package: Package, edge: &str, field: usize) -> io::Result<()> {
        let id = package.component.as_ref().ok_or_else(|| invalid("fresh component metadata"))?;
        let base = self.component_base(&package, edge)?;
        let already = |entries: &[Value]| {
            entries
                .iter()
                .any(|dependency| identity(&dependency["id"]).is_ok_and(|id| id == base))
        };
        if already(&self.dependencies[0]) || (field == 1 && already(&self.dependencies[1])) {
            return Ok(());
        }
        self.grammar.extend(
            package.concrete
                .iter()
                .chain(package.dependent.iter())
                .cloned(),
        );
        self.versions.push(ComponentVersion {
            field,
            index: self.dependencies[field].len(),
            concrete: package.concrete,
            dependent: package.dependent,
        });
        self.dependencies[field].push(
            json!({"id":id,"relativePaths":[],"packageName":package.name}),
        );
        Ok(())
    }
    fn component_base(&mut self, package: &Package, edge: &str) -> io::Result<String> {
        let id = package.component.as_ref().ok_or_else(|| invalid("fresh component metadata"))?;
        let base = identity(id)?;
        if base == unversioned(&self.request.identity) {
            return Err(invalid("fresh self component import"));
        }
        if !self.request.detection.workspace_components
            .iter()
            .any(|identity| unversioned(identity) == base)
            && package.concrete.as_deref().is_none_or(str::is_empty)
        {
            return Err(invalid("fresh external component version absent"));
        }
        if package.manifest["bit"]["peer"] != Value::Null
            && package.manifest["bit"]["peer"] != false
        {
            return Err(invalid("fresh peer component metadata"));
        }
        self.reader.check_main(package, edge)?;
        Ok(base)
    }
    fn finish(self) -> io::Result<Value> {
        let mut issues = Vec::new();
        if !self.issues.directory_imports.is_empty() {
            issues.push(serialized_issue("ImportFromDirectory", &self.issues.directory_imports)?);
        }
        if !self.issues.missing_files.is_empty() {
            issues.push(serialized_issue("MissingDependenciesOnFs", &self.issues.missing_files)?);
        }
        if !self.issues.missing_packages.is_empty() {
            issues.push(json!({"type":"MissingPackagesDependenciesOnFs",
                "data":serde_json::to_string(&self.issues.missing_packages).map_err(io::Error::other)?}));
        }
        let detected = json!({"allPackagesDependencies":{"packageDependencies":self.packages[0],"devPackageDependencies":self.packages[1],"peerPackageDependencies":self.packages[2]},"coreAspects":[],"issues":issues,"allDependencies":{"dependencies":self.dependencies[0],"devDependencies":self.dependencies[1],"peerDependencies":self.dependencies[2]},"overridesDependencies":{"manuallyRemovedDependencies":{},"manuallyAddedDependencies":{},"missingPackageDependencies":[]}});
        Ok(
            json!({"identity":self.request.identity,"detected":detected,"componentVersions":self.versions,"grammarInputs":self.grammar,"readSet":self.reader.proofs}),
        )
    }
}
fn serialized_issue(kind: &str, data: &Map<String, Value>) -> io::Result<Value> {
    Ok(json!({"type":kind,"data":serde_json::to_string(&data).map_err(io::Error::other)?}))
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
