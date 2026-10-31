//! `bit ws-config list` and `bit ws-config clean` helpers.

use crate::commands::color::Chalk;
use bit_install::{config::aspect_id_without_version, workspace::Workspace};
use serde_json::{Value, json};
use std::{fs, io, path::Path};

const STANDARD_WRITER_ENVS: &[&str] = &[
    "teambit.harmony/node",
    "teambit.react/react",
    "teambit.harmony/aspect",
    "teambit.envs/env",
    "teambit.react/react-native",
    "teambit.html/html",
    "teambit.mdx/mdx",
];

pub(super) const STANDARD_WRITERS: &[(&str, &str, &str, &str)] = &[
    ("typescript", "TypescriptConfigWriter", "tsconfig.json", "// bit-generated-typescript-config"),
    ("eslint", "EslintConfigWriter", ".eslintrc.json", "// bit-generated-eslint-config"),
    ("prettier", "PrettierConfigWriter", ".prettierrc.cjs", "// bit-generated-prettier-config"),
];

pub(super) fn format_list_output(env_ids: &[String], chalk: Chalk) -> String {
    env_ids
        .iter()
        .map(|env_id| {
            format!(
                "{}\n  TypescriptConfigWriter (typescript)\n  EslintConfigWriter (eslint)\n  PrettierConfigWriter (prettier)",
                chalk.bold(env_id),
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

pub(super) fn format_list_json(env_ids: &[String]) -> io::Result<String> {
    let writers: Vec<Value> = STANDARD_WRITERS
        .iter()
        .map(|&(writer_id, writer_name, target_file, _)| {
            json!({
                "id": writer_id,
                "name": writer_name,
                "patterns": [format!("**/{target_file}")],
            })
        })
        .collect();
    let entries: Vec<Value> = env_ids
        .iter()
        .map(|env_id| {
            json!({
                "envId": env_id,
                "configWriters": writers,
            })
        })
        .collect();
    serde_json::to_string_pretty(&entries).map_err(io::Error::other)
}

pub(super) fn format_clean_output(paths: &[String], dry_run: bool, chalk: Chalk) -> String {
    let verb = if dry_run { "will be" } else { "were" };
    let header = chalk.green(&format!("{} config files {verb} deleted", paths.len()));
    format!("{header}\n  {}\n", paths.join("\n  "))
}

pub(super) fn clean_workspace_configs(
    root: &Path,
    writers: Option<&[String]>,
    dry_run: bool,
) -> io::Result<Vec<String>> {
    let paths = find_configs_to_clean(root, writers)?;
    if !dry_run {
        for rel_path in &paths {
            let _ = fs::remove_file(root.join(rel_path));
        }
    }
    Ok(paths)
}

pub(super) fn find_configs_to_clean(
    root: &Path,
    writers: Option<&[String]>,
) -> io::Result<Vec<String>> {
    let mut found_by_writer: Vec<Vec<String>> = vec![Vec::new(); STANDARD_WRITERS.len()];
    scan_config_dir(root, root, writers, &mut found_by_writer)?;
    let mut paths = Vec::new();
    for mut writer_paths in found_by_writer {
        writer_paths.sort();
        for rel_path in writer_paths {
            if !paths.contains(&rel_path) {
                paths.push(rel_path);
            }
        }
    }
    Ok(paths)
}

fn scan_config_dir(
    root: &Path,
    dir: &Path,
    writers: Option<&[String]>,
    found_by_writer: &mut [Vec<String>],
) -> io::Result<()> {
    let Ok(read_dir) = fs::read_dir(dir) else {
        return Ok(());
    };
    for entry_res in read_dir {
        let entry = entry_res?;
        let file_name = entry.file_name();
        let Some(name_str) = file_name.to_str() else {
            continue;
        };
        if matches!(name_str, "node_modules" | ".git" | ".bit") {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            scan_config_dir(root, &path, writers, found_by_writer)?;
        } else if path.is_file() {
            check_config_file(root, &path, name_str, writers, found_by_writer);
        }
    }
    Ok(())
}

fn check_config_file(
    root: &Path,
    path: &Path,
    name_str: &str,
    writers: Option<&[String]>,
    found_by_writer: &mut [Vec<String>],
) {
    for (idx, &(writer_id, _, target_file, marker)) in STANDARD_WRITERS.iter().enumerate() {
        if name_str != target_file || !writer_matches(writer_id, writers) {
            continue;
        }
        let Ok(content) = fs::read_to_string(path) else {
            continue;
        };
        if content.contains(marker)
            && let Ok(rel) = path.strip_prefix(root)
        {
            let rel_str = rel.to_string_lossy().replace('\\', "/");
            found_by_writer[idx].push(rel_str);
        }
    }
}

pub(in crate::commands::ws_config) fn writer_matches(
    writer_id: &str,
    writers: Option<&[String]>,
) -> bool {
    let writer_id = writer_id.trim();
    writers.is_none_or(|filter| {
        filter
            .iter()
            .any(|item| item.trim() == writer_id)
    })
}

pub(in crate::commands) fn collect_standard_env_ids(ws: &Workspace) -> Option<Vec<String>> {
    let mut env_ids = Vec::new();
    for (_, comp) in ws.active() {
        let bare = aspect_id_without_version(&comp.env_id);
        if !STANDARD_WRITER_ENVS.contains(&bare) {
            return None;
        }
        if !env_ids
            .iter()
            .any(|existing| existing == bare)
        {
            env_ids.push(bare.to_owned());
        }
    }
    Some(env_ids)
}

pub(in crate::commands::ws_config) fn collect_active_component_dirs(ws: &Workspace) -> Vec<String> {
    ws.active()
        .map(|(_, comp)| {
            comp.root_dir
                .trim()
                .trim_start_matches("./")
                .trim_matches('/')
                .trim()
                .to_owned()
        })
        .filter(|dir| !dir.is_empty())
        .collect()
}
