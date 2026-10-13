use super::{
    invalid,
    packages::{Package, Reader},
    wire::{ComponentVersion, Detect},
};
use serde_json::{Map, Value, json};
use std::{io, path::Path};

pub(super) fn project(request: &Detect, graph: &Value) -> io::Result<Value> {
    let proofs = serde_json::from_value(graph["readSet"].clone()).map_err(io::Error::other)?;
    let mut projection = Projection {
        request,
        graph,
        reader: Reader::new(&request.component_root, proofs)?,
        dependencies: Default::default(),
        packages: Default::default(),
        versions: Vec::new(),
        grammar: Vec::new(),
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
    fn relative(&self, origin: &str, edge: &str) -> io::Result<()> {
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
            return Err(invalid("fresh import from directory"));
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
        {
            return Err(invalid("fresh external component graph"));
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
        let detected = json!({"allPackagesDependencies":{"packageDependencies":self.packages[0],"devPackageDependencies":self.packages[1],"peerPackageDependencies":self.packages[2]},"coreAspects":[],"issues":[],"allDependencies":{"dependencies":self.dependencies[0],"devDependencies":self.dependencies[1],"peerDependencies":self.dependencies[2]},"overridesDependencies":{"manuallyRemovedDependencies":{},"manuallyAddedDependencies":{},"missingPackageDependencies":[]}});
        Ok(
            json!({"identity":self.request.identity,"detected":detected,"componentVersions":self.versions,"grammarInputs":self.grammar,"readSet":self.reader.proofs}),
        )
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
