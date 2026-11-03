//! Saving ([`save_artifacts_to_dir`]) and formatting ([`render_artifacts_report`]) [`ComponentArtifacts`] for `bit artifacts`.
//!
//! Materializes stored artifact blobs into `--out-dir` and renders grouped terminal output.

use super::extractor::{ArtifactFile, ArtifactItem, ComponentArtifacts};
use crate::commands::{scope_set::Failure, workspace_command::format::Formatter};
use std::{env, fs, path::Path};

/// Materializes extracted [`ComponentArtifacts`] files into `out_dir` from `scope_dir` via [`save_component_artifacts`].
pub(super) fn save_artifacts_to_dir(
    scope_dir: &Path,
    results: &[ComponentArtifacts],
    out_dir: &str,
) -> Result<usize, Failure> {
    let trimmed_dir = out_dir.trim();
    if trimmed_dir.is_empty() {
        return Err(Failure::Declined("empty artifacts output directory".into()));
    }
    let out_path = Path::new(trimmed_dir);
    let base_dir = if out_path.is_absolute() {
        out_path.to_path_buf()
    } else {
        env::current_dir().map_err(|err| Failure::Declined(err.to_string()))?.join(out_path)
    };
    let mut total_saved = 0usize;
    for comp in results {
        total_saved += save_component_artifacts(scope_dir, &base_dir, comp)?;
    }
    Ok(total_saved)
}

/// Writes all artifact files for a single [`ComponentArtifacts`] entry under `base_dir` via [`save_single_artifact_file`].
fn save_component_artifacts(
    scope_dir: &Path,
    base_dir: &Path,
    comp: &ComponentArtifacts,
) -> Result<usize, Failure> {
    let comp_path = base_dir.join(sanitize_component_dir(&comp.identity_no_ver));
    let mut count = 0usize;
    for art in &comp.artifacts {
        for file in &art.files {
            save_single_artifact_file(scope_dir, &comp_path, file)?;
            count += 1;
        }
    }
    Ok(count)
}

/// Reads a 40-hex `Source` object from `scope_dir` and writes it to `comp_path` when the relative path is safe.
fn save_single_artifact_file(
    scope_dir: &Path,
    comp_path: &Path,
    file: &ArtifactFile,
) -> Result<(), Failure> {
    let hash = file.hash.trim();
    if hash.len() != 40
        || !hash.bytes().all(|byte| byte.is_ascii_hexdigit())
        || !is_safe_artifact_path(&file.relative_path)
    {
        return Err(Failure::Declined("missing hash or unsafe artifact path".into()));
    }
    let (_, bytes) = bit_object_import::read_raw_scope_object(scope_dir, hash)
        .ok()
        .flatten()
        .ok_or_else(|| Failure::Declined("missing Source object for artifact".into()))?;
    let target_path = comp_path.join(&file.relative_path);
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|err| Failure::Declined(err.to_string()))?;
    }
    fs::write(&target_path, &bytes).map_err(|err| Failure::Declined(err.to_string()))
}

/// Returns `true` when `relative_path` is a non-empty relative path with only normal components.
#[inline]
fn is_safe_artifact_path(relative_path: &str) -> bool {
    !relative_path.trim().is_empty()
        && !relative_path.contains('\\')
        && !relative_path.chars().any(char::is_control)
        && Path::new(relative_path)
            .components()
            .all(|part| matches!(part, std::path::Component::Normal(_)))
}

/// Sanitizes a component `identity` string into a safe directory name for `--out-dir` output.
#[inline]
fn sanitize_component_dir(identity: &str) -> String {
    let sanitized: String = identity
        .trim()
        .chars()
        .map(|ch| {
            if ch.is_control() || matches!(ch, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
            {
                '_'
            } else {
                ch
            }
        })
        .collect();
    if sanitized.is_empty() || matches!(sanitized.as_str(), "." | "..") {
        "_".to_owned()
    } else {
        sanitized
    }
}

/// Renders extracted [`ComponentArtifacts`] blocks and optional `--out-dir` summary footer for `pattern`.
pub(super) fn render_artifacts_report(
    results: &[ComponentArtifacts],
    pattern: &str,
    out_dir: Option<&str>,
    saved_count: usize,
    formatter: &Formatter,
) -> String {
    let total_artifacts: usize = results
        .iter()
        .map(|comp| comp.artifacts.len())
        .sum();
    if total_artifacts == 0 {
        return format!(
            "{} {}",
            formatter.warn_symbol(),
            formatter.chalk.yellow(&format!(r#"no artifacts found for "{pattern}""#)),
        );
    }
    let blocks = results
        .iter()
        .map(|comp| render_component_block(comp, formatter))
        .collect::<Vec<_>>()
        .join("\n\n");
    if let Some(dir) = out_dir
        .map(str::trim)
        .filter(|dir| !dir.is_empty())
    {
        let footer =
            formatter.success_summary(&format!(r#"{saved_count} file(s) saved to "{dir}""#));
        format!("{blocks}\n\n{footer}")
    } else {
        blocks
    }
}

fn render_component_block(comp: &ComponentArtifacts, formatter: &Formatter) -> String {
    let mut groups: Vec<(String, Vec<&ArtifactItem>)> = Vec::new();
    for art in &comp.artifacts {
        if let Some((_, list)) = groups
            .iter_mut()
            .find(|(aspect, _)| *aspect == art.aspect_id)
        {
            list.push(art);
        } else {
            groups.push((art.aspect_id.clone(), vec![art]));
        }
    }
    let aspect_sections = groups
        .into_iter()
        .map(|(aspect_id, items)| render_aspect_section(&aspect_id, &items, formatter))
        .collect::<Vec<_>>()
        .join("\n\n");
    format!("{}\n{aspect_sections}", formatter.chalk.cyan(&comp.display_id))
}

fn render_aspect_section(
    aspect_id: &str,
    items: &[&ArtifactItem],
    formatter: &Formatter,
) -> String {
    let title = formatter.title(aspect_id);
    let items_str = items
        .iter()
        .map(|art| {
            let sub_title =
                formatter.chalk.white(&format!("{} ({})", art.task_name, art.artifact_name));
            let files_str = art.files
                .iter()
                .map(|file| format!("      {}", formatter.chalk.dim(&file.relative_path)))
                .collect::<Vec<_>>()
                .join("\n");
            format!("    {sub_title}\n{files_str}")
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!("  {title}\n{items_str}")
}
