//! Output formatting and result payloads for `bit gc`.

use crate::commands::{color::Chalk, workspace_command::format::Formatter};
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GcRunFlags {
    pub dry_run: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backup_dir: Option<String>,
    pub backup: bool,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize)]
pub(super) struct GcDeletionStats {
    #[serde(rename = "deletedObjects")]
    pub objects: usize,
    #[serde(rename = "deletedSize")]
    pub size: u64,
    #[serde(rename = "deletedByType")]
    pub by_type: BTreeMap<String, DeletedTypeStats>,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GcDirSizes {
    pub stray_files: usize,
    pub stray_files_size: u64,
    pub backup_dir_size: u64,
    pub retained_dirs_size: u64,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GcResult {
    #[serde(flatten)]
    pub flags: GcRunFlags,
    pub total_objects: usize,
    pub total_size: u64,
    #[serde(flatten)]
    pub deleted: GcDeletionStats,
    pub kept_versions: usize,
    #[serde(flatten)]
    pub dirs: GcDirSizes,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize)]
pub(super) struct DeletedTypeStats {
    pub count: usize,
    pub size: u64,
}

pub(super) fn format_bytes(bytes: u64) -> String {
    if bytes < 1024 {
        return format!("{bytes} B");
    }
    let units = [
        (1024_u64, "KB"),
        (1024_u64.pow(2), "MB"),
        (1024_u64.pow(3), "GB"),
        (1024_u64.pow(4), "TB"),
    ];
    let mut chosen_index = 0;
    for (index, entry) in units.iter().enumerate() {
        if bytes >= entry.0 {
            chosen_index = index;
        }
    }
    let (mut divisor, mut unit) = units[chosen_index];
    let mut tenths = (bytes.saturating_mul(10) + divisor / 2) / divisor;
    if tenths >= 1024 * 10 && chosen_index + 1 < units.len() {
        (divisor, unit) = units[chosen_index + 1];
        tenths = (bytes.saturating_mul(10) + divisor / 2) / divisor;
    }
    format!("{}.{} {unit}", tenths / 10, tenths % 10)
}

pub(super) fn format_gc_report(result: &GcResult, chalk: Chalk) -> String {
    let formatter = Formatter::new(chalk);
    let freed_size = if result.flags.backup {
        result.dirs.stray_files_size
    } else {
        result.deleted.size.saturating_add(result.dirs.stray_files_size)
    };
    let size_after = result.total_size.saturating_sub(freed_size);
    let header = format_header(&formatter, result, freed_size);
    let summary_lines = build_summary_lines(&formatter, chalk, result, (freed_size, size_after));
    let hints = build_hints(&formatter, result);
    let first_section = format!("{header}\n{}", summary_lines.join("\n"));
    let second_section = hints.join("\n");
    Formatter::join(&[first_section, second_section])
}

fn format_header(formatter: &Formatter, result: &GcResult, freed_size: u64) -> String {
    if result.flags.dry_run {
        let fate = if result.flags.backup {
            "can be moved to the backup directory"
        } else {
            "can be removed"
        };
        return formatter.title(&format!(
            "[dry-run] {} of {} objects {fate}",
            result.deleted.objects, result.total_objects,
        ));
    }
    if result.flags.backup {
        return formatter.success_summary(&format!(
            "moved {} objects ({}) to the backup directory",
            result.deleted.objects,
            format_bytes(result.deleted.size),
        ));
    }
    formatter.success_summary(&format!(
        "removed {} objects, freed {}",
        result.deleted.objects,
        format_bytes(freed_size),
    ))
}

fn build_summary_lines(
    formatter: &Formatter,
    chalk: Chalk,
    result: &GcResult,
    sizes: (u64, u64),
) -> Vec<String> {
    let mut lines = vec![format_size_line(formatter, chalk, result, sizes)];
    if !result.flags.backup && result.dirs.backup_dir_size > 0 {
        lines.push(formatter.item(&format!(
            "{} of it is a backup directory from an earlier run",
            format_bytes(result.dirs.backup_dir_size),
        )));
    }
    if result.dirs.retained_dirs_size > 0 {
        lines.push(formatter.item(&format!(
            "{} of it is the trash and the stash, which gc never touches",
            format_bytes(result.dirs.retained_dirs_size),
        )));
    }
    for (kind, stats) in &result.deleted.by_type {
        if let Some(line) = format_type_stat_line(formatter, chalk, kind, stats) {
            lines.push(line);
        }
    }
    lines.push(formatter.item(&format!(
        "keeping {} versions and everything they point at",
        result.kept_versions,
    )));
    if result.dirs.stray_files > 0 {
        let noun = if result.dirs.stray_files == 1 { "file" } else { "files" };
        let size_dim = chalk.dim(&format!("({})", format_bytes(result.dirs.stray_files_size)));
        lines.push(formatter.item(&format!(
            "{} leftover temp {noun} of interrupted writes {size_dim}",
            result.dirs.stray_files,
        )));
    }
    lines
}

fn format_type_stat_line(
    formatter: &Formatter,
    chalk: Chalk,
    kind: &str,
    stats: &DeletedTypeStats,
) -> Option<String> {
    let kind = kind.trim();
    if kind.is_empty() || stats.count == 0 {
        return None;
    }
    let size_dim = chalk.dim(&format!("({})", format_bytes(stats.size)));
    Some(formatter.item(&format!("{kind}: {} objects {size_dim}", stats.count)))
}

fn format_size_line(
    formatter: &Formatter,
    chalk: Chalk,
    result: &GcResult,
    sizes: (u64, u64),
) -> String {
    let (freed_size, size_after) = sizes;
    if result.flags.backup {
        let in_backup =
            result.dirs.backup_dir_size.saturating_add(if result.flags.dry_run {
                0
            } else {
                result.deleted.size
            });
        let note = if result.flags.dry_run {
            let size_str = format_bytes(result.deleted.size);
            format!("({size_str} of it would move to the backup directory)")
        } else {
            format!("({} of it is in the backup directory)", format_bytes(in_backup))
        };
        return formatter.item(&format!(
            "scope: {} {}",
            chalk.bold(&format_bytes(size_after)),
            chalk.dim(&note),
        ));
    }
    let arrow = chalk.dim("\u{2192}");
    let base = format!(
        "scope: {} {arrow} {}",
        format_bytes(result.total_size),
        chalk.bold(&format_bytes(size_after)),
    );
    if result.flags.dry_run {
        let note = chalk.dim(&format!("(would free {})", format_bytes(freed_size)));
        formatter.item(&format!("{base} {note}"))
    } else {
        formatter.item(&base)
    }
}

fn build_hints(formatter: &Formatter, result: &GcResult) -> Vec<String> {
    let mut hints = Vec::new();
    if result.flags.dry_run && result.deleted.objects > 0 {
        let verb = if result.flags.backup { "move" } else { "remove" };
        hints.push(formatter.hint(&format!("re-run without --dry-run to {verb} them")));
    }
    if let Some(backup_dir) = result.flags.backup_dir
        .as_deref()
        .map(str::trim)
        .filter(|dir| !dir.is_empty())
    {
        hints.push(formatter.hint(&format!(
            "objects were moved to {backup_dir}. no disk space was freed until it is removed.",
        )));
        hints.push(formatter.hint(r#"run "bit gc --restore" to bring them back"#));
    } else if result.dirs.backup_dir_size > 0 {
        hints.push(formatter.hint(
            r#"run "bit gc --restore" to bring the backed-up objects back, or remove that directory to free it"#,
        ));
    }
    if !result.flags.dry_run && result.deleted.objects > 0 {
        hints.push(formatter.hint(
            "anything removed will be fetched from the remote again when it is needed",
        ));
    }
    hints
}
