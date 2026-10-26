use super::{
    super::{
        invalid,
        resolve_dependencies::{Budget, resolve_one},
    },
    Dependency, MAX_BYTES, PathMap, Request, Row,
};
use sha1::{Digest, Sha1};
use std::{
    collections::HashSet,
    io,
    path::Path,
    sync::atomic::{AtomicUsize, Ordering},
};

#[derive(Default)]
pub(super) struct ScanBudget {
    source_bytes: AtomicUsize,
    output_bytes: AtomicUsize,
}

pub(super) fn scan(
    request: &Request,
    file: &Path,
    builtins: &HashSet<&str>,
    scan_budget: &ScanBudget,
    budget: &Budget,
) -> io::Result<Row> {
    let filename = file.to_str().ok_or_else(|| invalid("dependency graph path encoding"))?;
    let bytes = read(file, &scan_budget.source_bytes, budget)?;
    let detector_scanned =
        !bytes.starts_with(b"// @bit-no-check") && !bytes.starts_with(b"/* @bit-no-check");
    let extension = file
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_default();
    let custom = request.detector.custom
        .as_ref()
        .and_then(|custom| custom.get(filename));
    if let Some(custom) = custom
        && format!("{:x}", Sha1::digest(&bytes)) != custom.source_hash
    {
        return Err(invalid("custom detector source changed"));
    }
    if custom.is_none() && !request.detector_extensions.contains(&extension) {
        return Ok(Row {
            path_map: PathMap { file: filename.to_owned(), dependencies: Vec::new() },
            missing: Vec::new(),
            missing_packages: Vec::new(),
            registered: Vec::new(),
            detector_scanned,
            error: None,
        });
    }
    let (ts, dependencies) = detected(request, custom, &extension, filename, bytes, scan_budget)?;
    let parent = file.parent().ok_or_else(|| invalid("dependency graph parent"))?;
    let resolver = Resolver { parent, home: request.home.as_deref(), budget, ts, custom };
    let mut row = resolver.row(filename, dependencies, builtins)?;
    row.detector_scanned = detector_scanned;
    row.error = custom.and_then(|custom| custom.error.clone());
    Ok(row)
}

fn detected(
    request: &Request,
    custom: Option<&super::CustomDetection>,
    extension: &str,
    filename: &str,
    bytes: Vec<u8>,
    budget: &ScanBudget,
) -> io::Result<(bool, Vec<String>)> {
    let ts = custom.map_or_else(
        || matches!(extension, ".ts" | ".tsx" | ".mts" | ".cts"),
        |custom| custom.typescript,
    );
    if ts && !request.detector.typescript {
        return Err(invalid("dependency graph TypeScript version"));
    }
    let source = String::from_utf8(bytes).map_err(|_| invalid("dependency graph source encoding"))?;
    let dependencies = match custom {
        Some(custom) => custom.dependencies.clone(),
        None => extract(filename, source, &budget.output_bytes)?,
    };
    Ok((ts, dependencies))
}

fn read(file: &Path, budget: &AtomicUsize, resolver: &Budget) -> io::Result<Vec<u8>> {
    // Account actual reads rather than trusting metadata across concurrent edits.
    let bytes = resolver
        .read_source(file)?
        .ok_or_else(|| invalid("dependency graph source disappeared"))?;
    if bytes.len() > 1024 * 1024
        || budget.fetch_add(bytes.len(), Ordering::Relaxed) + bytes.len() > MAX_BYTES as usize
    {
        return Err(invalid("dependency graph source read limit"));
    }
    Ok(bytes)
}

fn extract(filename: &str, source: String, output_bytes: &AtomicUsize) -> io::Result<Vec<String>> {
    if source.trim().is_empty()
        && matches!(
            Path::new(filename).extension().and_then(|ext| ext.to_str()),
            Some("css" | "scss" | "sass" | "styl" | "less"),
        )
    {
        return Ok(Vec::new());
    }
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
    custom: Option<&'a super::CustomDetection>,
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
            missing: Vec::new(),
            missing_packages: Vec::new(),
            registered: Vec::new(),
            detector_scanned: true,
            error: None,
        };
        for dependency in dependencies {
            if !builtins.contains(dependency.as_str())
                && !dependency.starts_with("http://")
                && !dependency.starts_with("https://")
            {
                self.classify(&dependency, filename, &mut row)?;
            }
        }
        Ok(row)
    }

    fn classify(&self, dependency: &str, filename: &str, row: &mut Row) -> io::Result<()> {
        if let Some(found) = self.resolve(dependency)? {
            row.path_map.dependencies.push(found);
        } else if dependency.starts_with('.') {
            row.missing.push(dependency.to_owned());
        } else {
            let package = package_name(dependency)?;
            if !row.missing_packages.contains(&package) {
                row.missing_packages.push(package);
            }
        }
        if !self.ts || !dependency.starts_with('.') {
            row.registered.push(filename.to_owned());
        }
        Ok(())
    }

    fn resolve(&self, dependency: &str) -> io::Result<Option<Dependency>> {
        if let Some(resolved) = self.custom.and_then(|custom| custom.lookups.get(dependency)) {
            return Ok(resolved
                .as_ref()
                .map(|path| Dependency {
                    import_source: dependency.to_owned(),
                    resolved_dep: path.to_string_lossy().into_owned(),
                    import_specifiers: None,
                }));
        }
        let resolved = resolve_one(
            dependency,
            self.parent,
            self.home,
            self.budget,
            if self.ts { "typescript5.9" } else { "commonjs" },
        )?;
        let Some(resolved) = resolved else { return Ok(None) };
        if !self.budget
            .metadata(Path::new(&resolved))?
            .is_some_and(super::super::source_overlay::Metadata::is_file)
        {
            return Err(invalid("dependency graph resolution disappeared"));
        }
        Ok(Some(Dependency {
            import_source: dependency.to_owned(),
            resolved_dep: resolved,
            import_specifiers: None,
        }))
    }
}

fn package_name(specifier: &str) -> io::Result<String> {
    let parts: Vec<_> = specifier.split('/').collect();
    let name = if specifier.starts_with('@') {
        if parts.len() < 2 {
            return Err(invalid("dependency scoped package name"));
        }
        format!("{}/{}", parts[0], parts[1])
    } else {
        parts[0].to_owned()
    };
    if name.is_empty() || name.contains('\\') {
        return Err(invalid("dependency package name"));
    }
    Ok(name)
}
