use super::{
    super::{
        invalid,
        resolve_dependencies::{Budget, resolve_one},
    },
    Dependency, MAX_BYTES, PathMap, Request, Row,
};
use std::{
    collections::HashSet,
    fs,
    io::{self, Read},
    path::Path,
    sync::atomic::{AtomicUsize, Ordering},
};

#[derive(Default)]
pub(super) struct ScanBudget {
    source_bytes: AtomicUsize,
    output_bytes: AtomicUsize,
    proof: bool,
}

impl ScanBudget {
    pub(super) fn new(proof: bool) -> Self {
        Self { proof, ..Self::default() }
    }
}
pub(super) fn scan(
    request: &Request,
    file: &Path,
    builtins: &HashSet<&str>,
    scan_budget: &ScanBudget,
    budget: &Budget,
) -> io::Result<Row> {
    let filename = file.to_str().ok_or_else(|| invalid("dependency graph path encoding"))?;
    let extension = file
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_default();
    let bytes = read(file, &scan_budget.source_bytes)?;
    let source_hash = if scan_budget.proof { super::proof::hash(&bytes) } else { String::new() };
    let detector_scanned =
        !bytes.starts_with(b"// @bit-no-check") && !bytes.starts_with(b"/* @bit-no-check");
    if !request.detector_extensions.contains(&extension) {
        return Ok(Row {
            path_map: PathMap { file: filename.to_owned(), dependencies: Vec::new() },
            registered: Vec::new(),
            detector_scanned,
            source_hash,
        });
    }
    let ts = matches!(extension.as_str(), ".ts" | ".tsx" | ".mts" | ".cts");
    if ts && !request.typescript {
        return Err(invalid("dependency graph TypeScript version"));
    }
    let source = String::from_utf8(bytes).map_err(|_| invalid("dependency graph source encoding"))?;
    let dependencies = extract(filename, source, &scan_budget.output_bytes)?;
    let parent = file.parent().ok_or_else(|| invalid("dependency graph parent"))?;
    let resolver = Resolver { parent, home: request.home.as_deref(), budget, ts };
    let mut row = resolver.row(filename, dependencies, builtins)?;
    row.detector_scanned = detector_scanned;
    row.source_hash = source_hash;
    Ok(row)
}

fn read(file: &Path, budget: &AtomicUsize) -> io::Result<Vec<u8>> {
    // Account actual reads rather than trusting metadata across concurrent edits.
    let mut bytes = Vec::new();
    fs::File::open(file)?
        .take(1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 1024 * 1024
        || budget.fetch_add(bytes.len(), Ordering::Relaxed) + bytes.len() > MAX_BYTES as usize
    {
        return Err(invalid("dependency graph source read limit"));
    }
    Ok(bytes)
}

fn extract(filename: &str, source: String, output_bytes: &AtomicUsize) -> io::Result<Vec<String>> {
    let outcome =
        bit_dependency_scanner::scan_source(filename.to_owned(), source).map_err(io::Error::other)?;
    if outcome["status"] != "ok" {
        return Err(invalid("dependency graph extraction requires canonical fallback"));
    }
    let size = serde_json::to_vec(&outcome).map_err(io::Error::other)?.len();
    if output_bytes.fetch_add(size, Ordering::Relaxed) + size > 16 * 1024 * 1024 {
        return Err(invalid("dependency graph extraction output budget"));
    }
    Ok(outcome["dependencies"]
        .as_object()
        .ok_or_else(|| invalid("dependency graph extraction"))?
        .keys()
        .cloned()
        .collect())
}
struct Resolver<'a> {
    parent: &'a Path,
    home: Option<&'a Path>,
    budget: &'a Budget,
    ts: bool,
}
impl Resolver<'_> {
    fn row(
        &self,
        filename: &str,
        dependencies: Vec<String>,
        builtins: &HashSet<&str>,
    ) -> io::Result<Row> {
        let mut row = Row {
            path_map: PathMap { file: filename.to_owned(), dependencies: Vec::new() },
            registered: Vec::new(),
            detector_scanned: true,
            source_hash: String::new(),
        };
        for dependency in dependencies {
            if builtins.contains(dependency.as_str())
                || dependency.starts_with("http://")
                || dependency.starts_with("https://")
            {
                continue;
            }
            row.path_map.dependencies.push(self.resolve(&dependency)?);
            if !self.ts || !dependency.starts_with('.') {
                row.registered.push(filename.to_owned());
            }
        }
        Ok(row)
    }

    fn resolve(&self, dependency: &str) -> io::Result<Dependency> {
        let resolved = resolve_one(
            dependency,
            self.parent,
            self.home,
            self.budget,
            if self.ts { "typescript5.9" } else { "commonjs" },
        )?
        .ok_or_else(|| {
            invalid("dependency graph unresolved dependency requires canonical fallback")
        })?;
        if !Path::new(&resolved).exists() {
            return Err(invalid("dependency graph resolution disappeared"));
        }
        Ok(Dependency {
            import_source: dependency.to_owned(),
            resolved_dep: resolved,
            import_specifiers: None,
        })
    }
}
