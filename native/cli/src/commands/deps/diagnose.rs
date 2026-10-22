//! Installed-package drill-down for `bit deps diagnose --package`.

use super::usage_render::compare_versions;
use crate::{
    commands::{
        color::Chalk,
        scope_set::Failure,
        workspace_command::{self, format::Formatter, results::Report},
    },
    native::Outcome,
};
use pnpm_lockfile::Lockfile;
use std::{ffi::OsString, fs, io, path::Path};

struct PackageReport<'a> {
    package_name: &'a str,
    pnpm_dirs: Vec<PackageCopy>,
}

struct PackageCopy {
    version: String,
    peer_suffix: Option<String>,
}

pub(super) fn run_package(
    root: &Path,
    args: &[OsString],
    package: &str,
    chalk: Chalk,
) -> io::Result<Outcome> {
    let report = match inspect(root, package) {
        Ok(report) => report,
        Err(Failure::Declined(reason) | Failure::User(reason)) => {
            return Ok(Outcome::Declined(format!("deps diagnose: {reason}")));
        }
    };
    let data = render(&report, chalk);
    workspace_command::execute_then(root, args, "diagnose", |_| {
        Ok(Report { data, code: 0, details: None })
    })
}

fn inspect<'a>(root: &Path, package: &'a str) -> Result<PackageReport<'a>, Failure> {
    let virtual_store = root.join("node_modules/.pnpm");
    if !virtual_store.is_dir() {
        return Err(Failure::Declined("pnpm virtual store is missing".into()));
    }
    let prefix = format!("{}@", package.replacen('/', "+", 1));
    let mut pnpm_dirs = entries(&virtual_store)?
        .into_iter()
        .filter_map(|entry| entry.strip_prefix(&prefix).map(parse_copy))
        .collect::<Vec<_>>();
    pnpm_dirs.sort_by(|a, b| {
        compare_versions(&a.version, &b.version).then_with(|| a.peer_suffix.cmp(&b.peer_suffix))
    });
    Ok(PackageReport { package_name: package, pnpm_dirs })
}

fn entries(virtual_store: &Path) -> Result<Vec<String>, Failure> {
    let dirs = physical_entries(virtual_store)?;
    if !dirs.is_empty() {
        return Ok(dirs);
    }
    lockfile_entries(virtual_store)
}

fn physical_entries(virtual_store: &Path) -> Result<Vec<String>, Failure> {
    let mut dirs = Vec::new();
    for entry in fs::read_dir(virtual_store).map_err(|error| Failure::Declined(error.to_string()))?
    {
        let entry = entry.map_err(|error| Failure::Declined(error.to_string()))?;
        if entry.file_type().is_ok_and(|kind| kind.is_dir()) {
            let name = entry
                .file_name()
                .to_string_lossy()
                .into_owned();
            if !name.starts_with('.') && name != "node_modules" {
                dirs.push(name);
            }
        }
    }
    Ok(dirs)
}

fn lockfile_entries(virtual_store: &Path) -> Result<Vec<String>, Failure> {
    let lockfile = Lockfile::load_from_path(&virtual_store.join("lock.yaml"))
        .map_err(|error| Failure::Declined(error.to_string()))?;
    Ok(lockfile
        .and_then(|lockfile| lockfile.packages)
        .map(|packages| {
            packages
                .keys()
                .map(|key| key.to_virtual_store_name(if cfg!(windows) { 60 } else { 120 }))
                .collect()
        })
        .unwrap_or_default())
}

fn parse_copy(suffix: &str) -> PackageCopy {
    let (version, peers) = suffix
        .split_once('_')
        .unwrap_or((suffix, ""));
    let peer_suffix = peers
        .split('_')
        .filter(|part| !part.is_empty())
        .map(|part| part.replace('+', "/"))
        .collect::<Vec<_>>()
        .join(" + ");
    PackageCopy {
        version: version.to_owned(),
        peer_suffix: (!peer_suffix.is_empty()).then_some(peer_suffix),
    }
}

fn render(report: &PackageReport<'_>, chalk: Chalk) -> String {
    let formatter = Formatter::new(chalk);
    let mut lines = vec![
        formatter.title(&format!("Package drill-down: {}", report.package_name)),
        String::new(),
        format!("  Installed copies: {}", report.pnpm_dirs.len()),
        String::new(),
    ];
    if report.pnpm_dirs.is_empty() {
        lines.push(format!(
            "  {} No .pnpm entries found for this package.",
            formatter.warn_symbol(),
        ));
        lines.push(formatter.hint(
            "  The package may not exist in this workspace, or it may be installed only once.",
        ));
        return lines.join("\n");
    }
    let mut index = 0;
    while index < report.pnpm_dirs.len() {
        let version = &report.pnpm_dirs[index].version;
        let end = report.pnpm_dirs[index..]
            .iter()
            .take_while(|copy| &copy.version == version)
            .count()
            + index;
        lines.push(format!(
            "{}{}",
            chalk.bold(&format!("  {}@{version}", report.package_name)),
            chalk.dim(&format!(" — {} copies", end - index)),
        ));
        for copy in &report.pnpm_dirs[index..end] {
            lines.push(format!(
                "    {}",
                chalk.dim(copy.peer_suffix.as_deref().unwrap_or("(no peers)")),
            ));
        }
        index = end;
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests;
