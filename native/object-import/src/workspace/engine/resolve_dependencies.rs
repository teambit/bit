use super::{
    dependency_graph::proof,
    invalid, path,
    source_overlay::{Metadata, SourceOverlay},
};
use rayon::prelude::*;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    fs,
    io::{self, Read},
    path::{Component, Path, PathBuf},
    sync::{
        Mutex,
        atomic::{AtomicUsize, Ordering},
    },
};

const EXTENSIONS: [&str; 15] = [
    ".js", ".json", ".cjs", ".mjs", ".jsx", ".ts", ".tsx", ".cts", ".mts", ".d.ts", ".css",
    ".scss", ".sass", ".styl", ".less",
];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request {
    mode: String,
    filename: PathBuf,
    dependencies: Vec<String>,
    home: Option<PathBuf>,
}

pub(super) fn resolve(request: &Request, pool: &rayon::ThreadPool) -> io::Result<(usize, Value)> {
    if !matches!(request.mode.as_str(), "commonjs" | "typescript5.9") {
        return Err(invalid("dependency resolution mode"));
    }
    path(&request.filename)?;
    let scanned = bit_dependency_scanner::scan_request(
        &json!({"version":1,"files":[{"path":request.filename}]}).to_string(),
        pool,
    )
    .map_err(io::Error::other)?;
    if scanned["files"][0]["status"] != "ok" {
        return Err(invalid("dependency source classification declined"));
    }

    if let Some(home) = &request.home {
        path(home)?;
    }
    if request.dependencies.len() > 4096 {
        return Err(invalid("dependency resolution count limit"));
    }
    let parent = request.filename.parent().ok_or_else(|| invalid("dependency source parent"))?;
    let budget = Budget::new();
    let resolved = pool.install(|| {
        request.dependencies
            .par_iter()
            .map(|dependency| {
                resolve_one(dependency, parent, request.home.as_deref(), &budget, &request.mode)
            })
            .collect::<io::Result<Vec<_>>>()
    })?;
    Ok((resolved.len(), json!({"resolved":resolved})))
}

pub(super) fn resolve_one(
    dependency: &str,
    parent: &Path,
    home: Option<&Path>,
    budget: &Budget,
    mode: &str,
) -> io::Result<Option<String>> {
    let resolved = if mode == "typescript5.9" && dependency.starts_with('.') {
        super::resolve_typescript::lookup(dependency, parent, budget)?
    } else {
        lookup(dependency, parent, home, budget)?
    };
    resolved
        .map(|file| {
            file.to_str()
                .map(str::to_owned)
                .ok_or_else(|| invalid("non-UTF8 dependency path"))
        })
        .transpose()
}

pub(super) struct Budget {
    operations: AtomicUsize,
    bytes: AtomicUsize,
    proofs: Option<Mutex<Vec<proof::Proof>>>,
    overlay: Option<SourceOverlay>,
}
impl Budget {
    pub(super) fn new() -> Self {
        Self::capture(false)
    }
    pub(super) fn capture(enabled: bool) -> Self {
        Self {
            operations: AtomicUsize::new(0),
            bytes: AtomicUsize::new(0),
            proofs: enabled.then(|| Mutex::new(Vec::new())),
            overlay: None,
        }
    }
    pub(super) fn overlay(view: &SourceOverlay) -> io::Result<Self> {
        Ok(Self {
            operations: AtomicUsize::new(0),
            bytes: AtomicUsize::new(0),
            proofs: Some(Mutex::new(view.proofs()?)),
            overlay: Some(view.clone()),
        })
    }
    pub(super) fn read_source(&self, file: &Path) -> io::Result<Option<Vec<u8>>> {
        if let Some(view) = &self.overlay {
            let mut proofs = Vec::new();
            let bytes = view.read(file, &mut proofs)?;
            for proof in proofs {
                self.record(proof)?;
            }
            return Ok(bytes);
        }
        let mut bytes = Vec::new();
        let source = match fs::File::open(file) {
            Ok(source) => source,
            Err(error)
                if matches!(
                    error.kind(),
                    io::ErrorKind::NotFound | io::ErrorKind::NotADirectory,
                ) =>
            {
                return Ok(None);
            }
            Err(error) => return Err(error),
        };
        source
            .take(1024 * 1024 + 1)
            .read_to_end(&mut bytes)?;
        if bytes.len() > 1024 * 1024 {
            return Err(invalid("dependency source read limit"));
        }
        if self.proofs.is_some() {
            self.record(proof::content(file, &bytes))?;
        }
        Ok(Some(bytes))
    }
    pub(super) fn proofs(&self) -> io::Result<Vec<proof::Proof>> {
        self.proofs
            .as_ref()
            .map_or_else(
                || Ok(Vec::new()),
                |proofs| {
                    proofs
                        .lock()
                        .map(|proofs| proof::unique(proofs.clone()))
                        .map_err(|_| invalid("dependency proof lock"))
                },
            )
    }
    fn record(&self, value: proof::Proof) -> io::Result<()> {
        if let Some(proofs) = &self.proofs {
            proofs
                .lock()
                .map_err(|_| invalid("dependency proof lock"))?
                .push(value);
        }
        Ok(())
    }
    pub(super) fn metadata(&self, file: &Path) -> io::Result<Option<Metadata>> {
        if self.operations.fetch_add(1, Ordering::Relaxed) >= 16384 {
            return Err(invalid("dependency resolution filesystem limit"));
        }
        if let Some(view) = &self.overlay {
            let mut proofs = Vec::new();
            let metadata = view.metadata(file, &mut proofs)?;
            for proof in proofs {
                self.record(proof)?;
            }
            return Ok(metadata);
        }
        let metadata = match fs::metadata(file) {
            Ok(metadata) => Ok(Some(metadata)),
            Err(error)
                if matches!(
                    error.kind(),
                    io::ErrorKind::NotFound | io::ErrorKind::NotADirectory,
                ) =>
            {
                Ok(None)
            }
            Err(error) => Err(error),
        }?;
        if self.proofs.is_some() {
            self.record(proof::metadata(file, metadata.as_ref())?)?;
        }
        Ok(metadata.as_ref().map(Metadata::disk))
    }
    pub(super) fn package(&self, file: &Path) -> io::Result<Option<Value>> {
        let Some(metadata) = self.metadata(file)? else {
            return Ok(None);
        };
        if !metadata.is_file() || metadata.len() > 1024 * 1024 {
            return Err(invalid("dependency package file limit"));
        }
        let bytes =
            self.read_source(file)?.ok_or_else(|| invalid("dependency package disappeared"))?;
        if bytes.len() > 1024 * 1024
            || self.bytes.fetch_add(bytes.len(), Ordering::Relaxed) + bytes.len() > 8 * 1024 * 1024
        {
            return Err(invalid("dependency package read limit"));
        }
        let source = std::str::from_utf8(&bytes).map_err(|_| invalid("dependency package UTF-8"))?;
        serde_json::from_str(source)
            .map(Some)
            .map_err(|_| invalid("dependency package JSON requires canonical fallback"))
    }
}

fn lookup(
    dependency: &str,
    parent: &Path,
    home: Option<&Path>,
    budget: &Budget,
) -> io::Result<Option<PathBuf>> {
    if dependency.is_empty()
        || dependency.len() > 32768
        || dependency.chars().any(char::is_control)
        || dependency.contains('\\')
        || dependency.contains(':')
    {
        return Err(invalid("unsupported dependency spelling"));
    }
    if dependency.starts_with('.') || Path::new(dependency).is_absolute() {
        return candidate(&normalize(&parent.join(dependency)), budget, 0);
    }
    if dependency.ends_with('/') {
        return Err(invalid("dependency trailing separator"));
    }
    for ancestor in parent.ancestors() {
        let candidate_path = normalize(&ancestor.join("node_modules").join(dependency));
        if let Some(found) = package_candidate(&candidate_path, budget)? {
            return Ok(Some(found));
        }
    }
    home_lookup(dependency, home, budget)
}
fn home_lookup(
    dependency: &str,
    home: Option<&Path>,
    budget: &Budget,
) -> io::Result<Option<PathBuf>> {
    let Some(home) = home else {
        return Ok(None);
    };
    for directory in [".node_modules", ".node_libraries"] {
        if let Some(found) =
            package_candidate(&normalize(&home.join(directory).join(dependency)), budget)?
        {
            return Ok(Some(found));
        }
    }
    Ok(None)
}

fn package_candidate(file: &Path, budget: &Budget) -> io::Result<Option<PathBuf>> {
    if let Some(parent) = file.parent()
        && budget.metadata(parent)?.is_some_and(super::source_overlay::Metadata::is_dir)
    {
        return candidate(file, budget, 0);
    }
    Ok(None)
}
pub(super) fn normalize(file: &Path) -> PathBuf {
    let mut output = PathBuf::new();
    for component in file.components() {
        match component {
            Component::ParentDir => {
                output.pop();
            }
            Component::CurDir => {}
            component => output.push(component.as_os_str()),
        }
    }
    output
}
fn candidate(file: &Path, budget: &Budget, depth: usize) -> io::Result<Option<PathBuf>> {
    if let Some(found) = load_file(file, budget)? {
        return Ok(Some(found));
    }
    load_directory(file, budget, depth)
}
fn load_file(file: &Path, budget: &Budget) -> io::Result<Option<PathBuf>> {
    // The canonical resolver reads the nearest package even without a path filter.
    for parent in file
        .parent()
        .into_iter()
        .flat_map(Path::ancestors)
    {
        if parent.parent().is_none()
            || parent
                .file_name()
                .is_some_and(|name| name == "node_modules")
        {
            break;
        }
        let package = parent.join("package.json");
        if budget.metadata(&package)?.is_some() {
            budget.package(&package)?;
            break;
        }
    }
    if regular_file(file, budget)? {
        return Ok(Some(file.to_path_buf()));
    }
    for extension in EXTENSIONS {
        let mut extended = file.as_os_str().to_owned();
        extended.push(extension);
        let extended = PathBuf::from(extended);
        if regular_file(&extended, budget)? {
            return Ok(Some(extended));
        }
    }
    Ok(None)
}
pub(super) fn regular_file(file: &Path, budget: &Budget) -> io::Result<bool> {
    match budget.metadata(file)? {
        Some(metadata) if metadata.is_file() => Ok(true),
        Some(metadata) if !metadata.is_dir() => Err(invalid("dependency special file")),
        _ => Ok(false),
    }
}
fn load_directory(file: &Path, budget: &Budget, depth: usize) -> io::Result<Option<PathBuf>> {
    if depth > 32 {
        return Err(invalid("dependency package nesting limit"));
    }
    let package = budget.package(&file.join("package.json"))?;
    if let Some(main) = package_main(package.as_ref())?
        && let Some(found) = candidate(&normalize(&file.join(main)), budget, depth + 1)?
    {
        return Ok(Some(found));
    }
    // `bit link` writes a local package whose `main` points at an unbuilt
    // dist, while `source` names the component file that is present.
    if let Some(source) = local_source(package.as_ref())?
        && let Some(found) = candidate(&normalize(&file.join(source)), budget, depth + 1)?
    {
        return Ok(Some(found));
    }
    load_file(&file.join("index"), budget)
}
fn local_source(package: Option<&Value>) -> io::Result<Option<&str>> {
    let Some(package) = package.filter(|package| {
        package["_bit_local"] == true && package["componentId"].is_object()
    }) else {
        return Ok(None);
    };
    let Some(source) = package.get("source") else { return Ok(None) };
    let source = source.as_str().ok_or_else(|| invalid("dependency local source type"))?;
    let path = Path::new(source);
    if source.is_empty()
        || path.is_absolute()
        || path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(invalid("dependency local source path"));
    }
    Ok(Some(source))
}
fn package_main(package: Option<&Value>) -> io::Result<Option<String>> {
    let Some(main) = package
        .as_ref()
        .and_then(|package| package.get("main"))
    else {
        return Ok(None);
    };
    if let Some(main) = main.as_str() {
        return Ok(match main {
            "" => None,
            "." | "./" => Some("index".to_owned()),
            value => Some(value.to_owned()),
        });
    }
    if main.is_null() || main == &Value::Bool(false) || main == &json!(0) {
        return Ok(None);
    }
    Err(invalid("dependency package main type"))
}
