//! Output formatting ([`render`], [`Report`], [`Formatter`], [`Options`]) for `bit fork`.

use super::options::Options;
use crate::commands::{
    color::Chalk,
    workspace_command::{format::Formatter, results::Report},
};
/// Builds the terminal [`Report`] summarizing single, pattern, or scope `bit fork` results ([`Options`]) via [`Formatter`] and [`summary`].
#[inline]
pub(super) fn render(options: &Options, ids: &[String], chalk: Chalk) -> Report {
    let formatter = Formatter::new(chalk);
    let summary = summary(options, ids, chalk);
    let mut sections = Vec::with_capacity(1 + usize::from(options.multiple()));
    sections.push(formatter.success_summary(&summary));
    if options.multiple() {
        let items = ids
            .iter()
            .map(|id| id.trim())
            .filter(|id| !id.is_empty())
            .map(|id| formatter.item(id))
            .collect::<Vec<_>>()
            .join("\n");
        if !items.is_empty() {
            sections.push(items);
        }
    }
    Report { data: sections.join("\n\n"), code: 0, details: None }
}
/// Formats the single-line summary sentence for `bit fork` or `bit scope fork` ([`Options`]) with [`Chalk`] via [`target_scope`].
#[inline]
fn summary(options: &Options, ids: &[String], chalk: Chalk) -> String {
    let source = options.source.trim();
    if options.scope_fork {
        let scope = target_scope(options, ids);
        format!("forked {} into {}", chalk.bold(source), chalk.bold(scope))
    } else if options.multiple() {
        let count = ids
            .iter()
            .filter(|id| !id.trim().is_empty())
            .count();
        format!("forked {count} component(s) matching pattern {}", chalk.bold(source))
    } else {
        let first_id = ids
            .iter()
            .map(|id| id.trim())
            .find(|id| !id.is_empty())
            .unwrap_or("");
        format!("forked {} from {}", chalk.bold(first_id), chalk.bold(source))
    }
}
/// Extracts the target scope name from `options.scope` or the first forked component ID in `ids` for [`summary`].
#[inline]
fn target_scope<'a>(options: &'a Options, ids: &'a [String]) -> &'a str {
    options.scope
        .as_deref()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .or_else(|| {
            ids.iter()
                .find_map(|id| {
                    id.trim()
                        .split_once('/')
                        .map(|(scope, _)| scope.trim())
                        .filter(|scope| !scope.is_empty())
                })
        })
        .unwrap_or_default()
}
