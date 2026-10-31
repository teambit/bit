//! Workspace dependency diagnosis text report.

use super::{entries, locale_number, table};
use crate::{
    commands::{
        color::Chalk,
        deps::{
            mutation::BitmapMutation,
            resolve::{ResolvedDep, WorkspaceDepsContext},
            usage_render::compare_versions,
        },
        scope_set::Failure,
        set_peer::load_dep_resolver_config,
        workspace_command::{self, format::Formatter, results::Report},
    },
    native::Outcome,
};
use std::{collections::HashMap, env, ffi::OsString, io, path::Path};

struct PackageInfo {
    name: String,
    versions: Vec<String>,
    peer: bool,
    copies: usize,
    origins: Vec<VersionOrigin>,
}

struct VersionOrigin {
    version: String,
    component_id: String,
    explicit: bool,
}

struct Diagnosis {
    components: usize,
    store_entries: usize,
    unique: usize,
    duplicated: usize,
    packages: Vec<PackageInfo>,
}

pub(in crate::commands::deps) fn run(
    root: &Path,
    args: &[OsString],
    chalk: Chalk,
    origins: bool,
) -> io::Result<Outcome> {
    let diagnosis = match inspect(root, origins) {
        Ok(diagnosis) => diagnosis,
        Err(Failure::User(message)) => {
            if env::var_os("CI").is_some_and(|val| !val.to_string_lossy().trim().is_empty()) {
                return Ok(Outcome::Declined("CI deps diagnose error stack".into()));
            }
            return workspace_command::execute_then(root, args, "diagnose", |_| {
                Err(io::Error::other(message))
            });
        }
        Err(Failure::Declined(reason)) => {
            return Ok(Outcome::Declined(format!("deps diagnose: {reason}")));
        }
    };
    let data = render(&diagnosis, chalk, origins);
    workspace_command::execute_then(root, args, "diagnose", |output| {
        if diagnosis.components > 0 {
            output.status(&format!("loading {} component(s)", diagnosis.components));
        }
        Ok(Report { data, code: 0, details: None })
    })
}

fn inspect(root: &Path, origins: bool) -> Result<Diagnosis, Failure> {
    let ctx = WorkspaceDepsContext::load(root)?;
    let store = root.join("node_modules/.pnpm");
    if !store.is_dir() {
        if !ctx.ws.components.is_empty() {
            return Err(Failure::Declined("pnpm store missing with active components".into()));
        }
        return Err(Failure::User(format!(
            r#""bit deps diagnose" requires a pnpm-managed workspace. Expected "{}" to exist. Run "bit install" first."#,
            store.display(),
        )));
    }
    let entries = entries(&store)?;
    let copies = count_copies(&entries);
    let (bitmap, _) = BitmapMutation::load(root)?;
    let mut packages = collect_component_packages(&ctx, &bitmap.bitmap_val)?;
    for package in &mut packages {
        package.copies = copies
            .get(&package.name)
            .copied()
            .unwrap_or_default();
    }
    if origins && packages.iter().any(unsupported_origin) {
        return Err(Failure::Declined(
            "peer version origins require component policy provenance".into(),
        ));
    }
    let duplicated = copies
        .values()
        .filter(|&&count| count > 1)
        .count();
    Ok(Diagnosis {
        components: ctx.ws.components.len(),
        store_entries: entries.len(),
        unique: copies.len(),
        duplicated,
        packages,
    })
}

fn unsupported_origin(package: &PackageInfo) -> bool {
    package.peer
        && package.versions.len() > 1
        && package.origins.iter().any(|origin| !origin.explicit)
}

fn count_copies(entries: &[String]) -> HashMap<String, usize> {
    let mut copies = HashMap::new();
    for entry in entries {
        if let Some(name) = package_name(entry) {
            *copies.entry(name).or_default() += 1;
        }
    }
    copies
}

fn package_name(entry: &str) -> Option<String> {
    let entry = entry.trim();
    if let Some((scope, rest)) = entry.split_once('+')
        && scope.starts_with('@')
        && scope.len() > 1
    {
        let (name, _) = rest.split_once('@')?;
        let (scope, name) = (scope.trim(), name.trim());
        return (!name.is_empty()).then(|| format!("{scope}/{name}"));
    }
    let (name, _) = entry.split_once('@')?;
    let name = name.trim();
    (!name.is_empty()).then(|| name.to_owned())
}

fn collect_component_packages(
    ctx: &WorkspaceDepsContext,
    bitmap: &serde_json::Value,
) -> Result<Vec<PackageInfo>, Failure> {
    let mut packages: Vec<PackageInfo> = Vec::new();
    for (entry, component) in ctx.ws.entries.iter().zip(&ctx.ws.components) {
        let config = load_dep_resolver_config(&ctx.root, bitmap, entry)?;
        let (deps, _) = ctx.collect_component_deps(
            entry,
            component,
            config
                .as_ref()
                .and_then(|value| value.get("policy")),
        );
        for dep in deps {
            let explicit = explicit_policy(config.as_ref(), &dep);
            let origin = VersionOrigin {
                version: dep.version.clone(),
                component_id: component.id.to_string_without_version(),
                explicit,
            };
            add_dependency(&mut packages, dep, origin);
        }
    }
    for package in &mut packages {
        package.versions.sort_by(|left, right| compare_versions(left, right));
    }
    Ok(packages)
}

fn explicit_policy(config: Option<&serde_json::Value>, dep: &ResolvedDep) -> bool {
    let field = match dep.lifecycle {
        "peer" => "peerDependencies",
        "dev" => "devDependencies",
        _ => "dependencies",
    };
    let Some(value) = config
        .and_then(|cfg| cfg.get("policy"))
        .and_then(|policy| policy.get(field))
        .and_then(|map| map.get(&dep.package_name))
    else {
        return false;
    };
    value
        .as_str()
        .or_else(|| value["version"].as_str())
        .map(str::trim)
        == Some(dep.version.trim())
}

fn add_dependency(packages: &mut Vec<PackageInfo>, dep: ResolvedDep, origin: VersionOrigin) {
    if let Some(info) = packages
        .iter_mut()
        .find(|info| info.name == dep.package_name)
    {
        if !info.versions.contains(&dep.version) {
            info.versions.push(dep.version);
        }
        info.peer |= dep.lifecycle == "peer";
        info.origins.push(origin);
    } else {
        packages.push(PackageInfo {
            name: dep.package_name,
            versions: vec![dep.version],
            peer: dep.lifecycle == "peer",
            copies: 0,
            origins: vec![origin],
        });
    }
}

fn render(diagnosis: &Diagnosis, chalk: Chalk, origins: bool) -> String {
    let formatter = Formatter::new(chalk);
    let factor = if diagnosis.unique == 0 {
        "N/A".to_owned()
    } else {
        format!("{:.1}x bloat factor", diagnosis.store_entries as f64 / diagnosis.unique as f64)
    };
    let mut sections = vec![
        formatter.title("Dependency Diagnosis for workspace"),
        String::new(),
        formatter.title("Summary:"),
        format!("  Components in workspace: {}", diagnosis.components),
        format!("  Unique packages: {}", locale_number(diagnosis.unique)),
        format!(
            "  Installed copies (.pnpm entries): {} ({factor})",
            locale_number(diagnosis.store_entries),
        ),
        format!("  Packages with duplicates: {}", diagnosis.duplicated),
    ];
    append_spread(&mut sections, diagnosis, &formatter);
    append_peers(&mut sections, diagnosis, &formatter, origins);
    sections.join("\n")
}

fn append_spread(sections: &mut Vec<String>, diagnosis: &Diagnosis, formatter: &Formatter) {
    let mut spread = diagnosis.packages
        .iter()
        .filter(|pkg| pkg.versions.len() > 1)
        .collect::<Vec<_>>();
    spread.sort_by_key(|package| std::cmp::Reverse(spread_copies(package)));
    spread.truncate(30);
    if spread.is_empty() {
        return;
    }
    let mut rows =
        vec![vec!["Package".into(), "Versions".into(), "Copies".into(), "Impact".into()]];
    for package in spread {
        let copies = spread_copies(package);
        let impact = if copies >= 10 {
            "HIGH"
        } else if copies >= 5 {
            "MEDIUM"
        } else {
            "LOW"
        };
        rows.push(vec![
            package.name.clone(),
            package.versions.len().to_string(),
            copies.to_string(),
            impact.into(),
        ]);
    }
    sections.extend([
        String::new(),
        formatter.title("Top version-spread packages:"),
        impact_table(&rows, formatter.chalk),
    ]);
}

fn impact_table(rows: &[Vec<String>], chalk: Chalk) -> String {
    let mut lines = table(rows)
        .split('\n')
        .map(str::to_owned)
        .collect::<Vec<_>>();
    for (line, row) in lines
        .iter_mut()
        .skip(1)
        .zip(rows.iter().skip(1))
    {
        let impact = &row[3];
        let Some(start) = line.rfind(impact) else { continue };
        let painted = match impact.as_str() {
            "HIGH" => chalk.red(impact),
            "MEDIUM" => chalk.yellow(impact),
            _ => chalk.green(impact),
        };
        line.replace_range(start..start + impact.len(), &painted);
    }
    lines.join("\n")
}

fn spread_copies(package: &PackageInfo) -> usize {
    if package.copies == 0 { package.versions.len() } else { package.copies }
}

fn append_peers(
    sections: &mut Vec<String>,
    diagnosis: &Diagnosis,
    formatter: &Formatter,
    origins: bool,
) {
    let mut peers = diagnosis.packages
        .iter()
        .filter(|pkg| pkg.peer && pkg.versions.len() > 1)
        .collect::<Vec<_>>();
    peers.sort_by(|left, right| {
        right.copies
            .cmp(&left.copies)
            .then_with(|| {
                right.versions
                    .len()
                    .cmp(&left.versions.len())
            })
    });
    if peers.is_empty() {
        return;
    }
    let rows = peer_rows(&peers);
    sections.extend([
        String::new(),
        formatter.title("Peer dependencies causing permutations:"),
        peer_table(&rows, formatter.chalk),
    ]);
    if origins {
        append_origins(sections, &peers, formatter);
    } else {
        sections.extend([
            String::new(),
            formatter.hint("  Tip: use --origins to see which envs and components contribute each peer version"),
        ]);
    }
}

fn peer_rows(peers: &[&PackageInfo]) -> Vec<Vec<String>> {
    let mut rows =
        vec![vec!["Package".into(), "Declared versions".into(), "Installed copies".into()]];
    for package in peers {
        let copies = if package.copies == 0 {
            "0 (not installed)".to_owned()
        } else {
            package.copies.to_string()
        };
        rows.push(vec![
            package.name.clone(),
            format!("{} ({})", package.versions.len(), package.versions.join(", ")),
            copies,
        ]);
    }
    rows
}

fn append_origins(sections: &mut Vec<String>, peers: &[&PackageInfo], formatter: &Formatter) {
    let mut lines = Vec::new();
    for package in peers {
        lines.push(format!("  {}", formatter.chalk.bold(&package.name)));
        for version in &package.versions {
            let mut components = package.origins
                .iter()
                .filter(|origin| &origin.version == version)
                .take(5)
                .collect::<Vec<_>>();
            components.sort_by(|left, right| left.component_id.cmp(&right.component_id));
            if components.is_empty() {
                continue;
            }
            lines.push(format!("    {}", formatter.chalk.cyan(version)));
            lines.push(format!(
                "      components: {}",
                components
                    .iter()
                    .map(|origin| origin.component_id.as_str())
                    .collect::<Vec<_>>()
                    .join(", "),
            ));
        }
    }
    if !lines.is_empty() {
        sections.extend([String::new(), formatter.title("  Peer version origins:")]);
        sections.extend(lines);
    }
}

fn peer_table(rows: &[Vec<String>], chalk: Chalk) -> String {
    let mut lines = table(rows)
        .split('\n')
        .map(str::to_owned)
        .collect::<Vec<_>>();
    for (line, row) in lines
        .iter_mut()
        .skip(1)
        .zip(rows.iter().skip(1))
    {
        let copies = &row[2];
        if copies != "0 (not installed)" {
            continue;
        }
        if let Some(start) = line.rfind(copies) {
            line.replace_range(start..start + copies.len(), &chalk.dim(copies));
        }
    }
    lines.join("\n")
}
