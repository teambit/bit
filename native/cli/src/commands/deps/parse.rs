//! CLI argument parsing for `bit deps` (`bit dependencies`).

use super::{Subcommand, write::WriteTarget};
use crate::commands::aspect::is_supported_pattern;

pub(in crate::commands) fn parse_subcommand(args: &[&str]) -> Option<Subcommand> {
    let filtered = args
        .iter()
        .copied()
        .filter(|arg| *arg != "--no-color")
        .collect::<Vec<_>>();
    match filtered.as_slice() {
        ["set", rest @ ..] => parse_set(rest),
        ["remove", rest @ ..] => parse_remove_or_unset(rest, false),
        ["unset", rest @ ..] => parse_remove_or_unset(rest, true),
        ["reset", pattern] if is_supported_pattern(pattern) => {
            Some(Subcommand::Reset { pattern: (*pattern).to_owned() })
        }
        ["eject", pattern] if is_supported_pattern(pattern) => {
            Some(Subcommand::Eject { pattern: (*pattern).to_owned() })
        }
        ["get", rest @ ..] => parse_get(rest),
        ["debug", id]
            if !id.starts_with('-')
                && is_supported_pattern(id)
                && !id.contains(['*', ',', '!']) =>
        {
            Some(Subcommand::Debug { id: (*id).to_owned() })
        }
        ["usage", rest @ ..] => parse_usage(rest),
        ["blame", rest @ ..] => parse_blame(rest),
        ["diagnose", rest @ ..] => parse_diagnose(rest),
        ["circular", rest @ ..] => parse_circular(rest),
        ["write", rest @ ..] => parse_write(rest),
        [sub] if !sub.starts_with('-') && !is_known_deps_subcommand(sub) => {
            Some(Subcommand::Unrecognized((*sub).to_owned()))
        }
        _ => None,
    }
}

fn parse_get(rest: &[&str]) -> Option<Subcommand> {
    let mut id = None;
    let mut tree = false;
    let mut scope = false;
    for &arg in rest {
        match arg {
            "-t" | "--tree" | "--tree=true" => tree = true,
            "--tree=false" => tree = false,
            "--scope" | "--scope=true" => scope = true,
            "--scope=false" => scope = false,
            value if id.is_none() && is_supported_get_id(value) => {
                id = Some(value);
            }
            _ => return None,
        }
    }
    Some(Subcommand::Get { id: id?.to_owned(), tree, scope })
}

fn is_supported_get_id(value: &str) -> bool {
    if value.is_empty() || value.starts_with('-') {
        return false;
    }
    let (bare, ver) = value
        .rsplit_once('@')
        .map_or((value, None), |(bare, ver)| (bare, Some(ver)));
    !bare.is_empty()
        && is_supported_pattern(bare)
        && !bare.contains(['*', ',', '!'])
        && ver.is_none_or(|ver| {
            !ver.is_empty() && !ver.contains('@') && !ver.chars().any(char::is_whitespace)
        })
}

fn parse_blame(rest: &[&str]) -> Option<Subcommand> {
    let [component, dep] = rest else { return None };
    if component.starts_with('-') || dep.starts_with('-') {
        return None;
    }
    Some(Subcommand::Blame { component: (*component).to_owned(), dep: (*dep).to_owned() })
}

fn parse_diagnose(rest: &[&str]) -> Option<Subcommand> {
    let mut origins = None;
    let mut package = None;
    let mut idx = 0;
    while idx < rest.len() {
        match rest[idx] {
            "--origins" | "--origins=true" => origins = Some(true),
            "--origins=false" => origins = Some(false),
            "--package" => {
                idx += 1;
                package = Some(valid_diagnose_pkg(rest.get(idx)?)?);
            }
            arg if let Some(val) = arg.strip_prefix("--package=") => {
                package = Some(valid_diagnose_pkg(val)?);
            }
            _ => return None,
        }
        idx += 1;
    }
    match (origins, package) {
        (None, Some(package)) => Some(Subcommand::DiagnosePackage { package }),
        (origins, None) => Some(Subcommand::Diagnose { origins: origins.unwrap_or(false) }),
        (Some(_), Some(_)) => None,
    }
}

fn valid_diagnose_pkg(val: &str) -> Option<String> {
    (!val.is_empty() && !val.starts_with('-')).then(|| val.to_owned())
}

fn parse_circular(rest: &[&str]) -> Option<Subcommand> {
    let mut json = false;
    let mut include_deps = false;
    for &arg in rest {
        match arg {
            "-j" | "--json" | "--json=true" => json = true,
            "--json=false" => json = false,
            "--include-deps" | "--include-deps=true" => include_deps = true,
            "--include-deps=false" => include_deps = false,
            _ => return None,
        }
    }
    Some(Subcommand::Circular { json, include_deps })
}

fn is_known_deps_subcommand(sub: &str) -> bool {
    matches!(
        sub,
        "get"
            | "remove"
            | "unset"
            | "debug"
            | "set"
            | "reset"
            | "eject"
            | "blame"
            | "usage"
            | "diagnose"
            | "circular"
            | "write",
    )
}

fn parse_set(rest: &[&str]) -> Option<Subcommand> {
    let mut dev = false;
    let mut optional = false;
    let mut peer = false;
    let mut positional = Vec::new();
    for &arg in rest {
        match arg {
            "-d" | "--dev" | "--dev=true" => dev = true,
            "--dev=false" => dev = false,
            "-o" | "--optional" | "--optional=true" => optional = true,
            "--optional=false" => optional = false,
            "-p" | "--peer" | "--peer=true" => peer = true,
            "--peer=false" => peer = false,
            val if !val.starts_with('-') => positional.push(val),
            val => apply_short_dep_flags(val, &mut dev, Some(&mut optional), &mut peer)?,
        }
    }
    let [pattern, raw_pkgs @ ..] = positional.as_slice() else {
        return None;
    };
    if !is_supported_pattern(pattern) || raw_pkgs.is_empty() {
        return None;
    }
    let mut packages = Vec::with_capacity(raw_pkgs.len());
    for &raw_pkg in raw_pkgs {
        packages.push(split_pkg_name_and_explicit_ver(raw_pkg)?);
    }
    Some(Subcommand::Set { pattern: (*pattern).to_owned(), packages, dev, optional, peer })
}

fn parse_remove_or_unset(rest: &[&str], unset: bool) -> Option<Subcommand> {
    let mut dev = false;
    let mut peer = false;
    let mut positional = Vec::new();
    for &arg in rest {
        match arg {
            "-d" | "--dev" | "--dev=true" => dev = true,
            "--dev=false" => dev = false,
            "-p" | "--peer" | "--peer=true" => peer = true,
            "--peer=false" => peer = false,
            val if !val.starts_with('-') => positional.push(val),
            val => apply_short_dep_flags(val, &mut dev, None, &mut peer)?,
        }
    }
    let [pattern, raw_pkgs @ ..] = positional.as_slice() else {
        return None;
    };
    if !is_supported_pattern(pattern)
        || raw_pkgs.is_empty()
        || raw_pkgs
            .iter()
            .any(|pkg| pkg.is_empty() || pkg.chars().any(char::is_whitespace))
    {
        return None;
    }
    let packages = raw_pkgs
        .iter()
        .map(|pkg| (*pkg).to_owned())
        .collect();
    Some(if unset {
        Subcommand::Unset { pattern: (*pattern).to_owned(), packages, dev, peer }
    } else {
        Subcommand::Remove { pattern: (*pattern).to_owned(), packages, dev, peer }
    })
}

fn apply_short_dep_flags(
    arg: &str,
    dev: &mut bool,
    mut optional: Option<&mut bool>,
    peer: &mut bool,
) -> Option<()> {
    let flags = arg.strip_prefix('-')?;
    if flags.is_empty() || flags.starts_with('-') {
        return None;
    }
    for ch in flags.chars() {
        match ch {
            'd' => *dev = true,
            'o' => **optional.as_mut()? = true,
            'p' => *peer = true,
            _ => return None,
        }
    }
    Some(())
}

pub(in crate::commands) fn parse_why(args: &[&str]) -> Option<Subcommand> {
    let filtered = args
        .iter()
        .copied()
        .filter(|arg| *arg != "--no-color")
        .collect::<Vec<_>>();
    let (dep_name, depth) = parse_usage_args(&filtered)?;
    Some(Subcommand::Why { dep_name, depth })
}

fn parse_usage(rest: &[&str]) -> Option<Subcommand> {
    let (dep_name, depth) = parse_usage_args(rest)?;
    Some(Subcommand::Usage { dep_name, depth })
}

fn parse_usage_args(rest: &[&str]) -> Option<(String, Option<usize>)> {
    let mut dep_name = None;
    let mut depth = None;
    let mut idx = 0;
    while idx < rest.len() {
        let arg = rest[idx];
        if let Some(val) = arg.strip_prefix("--depth=") {
            depth = Some(val.parse::<usize>().ok()?);
        } else if arg == "--depth" {
            idx += 1;
            depth = Some(rest.get(idx)?.parse::<usize>().ok()?);
        } else if !arg.starts_with('-') && !arg.is_empty() && dep_name.is_none() {
            dep_name = Some(arg.to_owned());
        } else {
            return None;
        }
        idx += 1;
    }
    Some((dep_name?, depth))
}

fn parse_write(rest: &[&str]) -> Option<Subcommand> {
    let mut target = WriteTarget::WorkspaceJsonc;
    let mut idx = 0;
    while idx < rest.len() {
        let raw = if rest[idx] == "--target" {
            idx += 1;
            *rest.get(idx)?
        } else {
            rest[idx].strip_prefix("--target=")?
        };
        target = match raw {
            "workspace.jsonc" => WriteTarget::WorkspaceJsonc,
            "package.json" => WriteTarget::PackageJson,
            _ => return None,
        };
        idx += 1;
    }
    Some(Subcommand::Write { target })
}

fn split_pkg_name_and_explicit_ver(raw: &str) -> Option<(String, String)> {
    if raw.is_empty() || raw.chars().any(char::is_whitespace) {
        return None;
    }
    let (name, ver) = raw.rsplit_once('@')?;
    if !is_valid_pkg_name(name) || ver.is_empty() || ver == "latest" {
        return None;
    }
    Some((name.to_owned(), snap_to_semver(ver)))
}

fn is_valid_pkg_name(name: &str) -> bool {
    if let Some(scoped) = name.strip_prefix('@') {
        !scoped.is_empty() && scoped.contains('/') && !scoped.contains('@')
    } else {
        !name.is_empty() && !name.contains('@')
    }
}

pub(in crate::commands::deps) fn snap_to_semver(ver: &str) -> String {
    if ver.len() == 40
        && ver
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        format!("0.0.0-{ver}")
    } else {
        ver.to_owned()
    }
}
