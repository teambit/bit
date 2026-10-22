//! CLI argument parsing for `bit deps` (`bit dependencies`).

use super::{Subcommand, write::WriteTarget};
use crate::commands::aspect::is_supported_pattern;

pub(in crate::commands) fn parse_subcommand(args: &[&str]) -> Option<Subcommand> {
    let filtered = args
        .iter()
        .copied()
        .filter(|arg| *arg != "--no-color")
        .collect::<Vec<_>>();
    if filtered.first() == Some(&"circular") && args.contains(&"--no-color") {
        return None;
    }
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
        ["get", id] if is_supported_pattern(id) && !id.contains(['*', ',', '!']) => {
            Some(Subcommand::Get { id: (*id).to_owned() })
        }
        ["usage", rest @ ..] => parse_usage(rest),
        ["circular", rest @ ..] => parse_circular(rest),
        ["write", rest @ ..] => parse_write(rest),
        [sub] if !sub.starts_with('-') && !is_known_deps_subcommand(sub) => {
            Some(Subcommand::Unrecognized((*sub).to_owned()))
        }
        _ => None,
    }
}

fn parse_circular(rest: &[&str]) -> Option<Subcommand> {
    let mut json = false;
    let mut include_deps = false;
    for &arg in rest {
        match arg {
            "-j" | "--json" => json = true,
            "--include-deps" => include_deps = true,
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
            "-d" | "--dev" => dev = true,
            "-o" | "--optional" => optional = true,
            "-p" | "--peer" => peer = true,
            val if !val.starts_with('-') => positional.push(val),
            _ => return None,
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
            "-d" | "--dev" => dev = true,
            "-p" | "--peer" => peer = true,
            val if !val.starts_with('-') => positional.push(val),
            _ => return None,
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

fn parse_usage(rest: &[&str]) -> Option<Subcommand> {
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
    Some(Subcommand::Usage { dep_name: dep_name?, depth })
}

fn parse_write(rest: &[&str]) -> Option<Subcommand> {
    let target = match rest {
        [] | ["--target=workspace.jsonc"] | ["--target", "workspace.jsonc"] => {
            WriteTarget::WorkspaceJsonc
        }
        ["--target=package.json"] | ["--target", "package.json"] => WriteTarget::PackageJson,
        _ => return None,
    };
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
