use super::options::Options;
use crate::commands::{
    color::Chalk,
    workspace_command::{format::Formatter, results::Report},
};
pub(super) fn render(options: &Options, ids: &[String], chalk: Chalk) -> Report {
    let formatter = Formatter::new(chalk);
    let summary = summary(options, ids, chalk);
    let mut sections = vec![formatter.success_summary(&summary)];
    if options.multiple() {
        sections.push(
            ids.iter()
                .map(|id| formatter.item(id))
                .collect::<Vec<_>>()
                .join("\n"),
        );
    }
    Report { data: sections.join("\n\n"), code: 0, details: None }
}
fn summary(options: &Options, ids: &[String], chalk: Chalk) -> String {
    let source = options.source.trim();
    if options.scope_fork {
        let scope = target_scope(options, ids);
        format!("forked {} into {}", chalk.bold(source), chalk.bold(scope))
    } else if options.multiple() {
        format!("forked {} component(s) matching pattern {}", ids.len(), chalk.bold(source))
    } else {
        let first_id = ids.first().map_or("", |id| id.trim());
        format!("forked {} from {}", chalk.bold(first_id), chalk.bold(source))
    }
}
fn target_scope<'a>(options: &'a Options, ids: &'a [String]) -> &'a str {
    options.scope
        .as_deref()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .or_else(|| {
            ids.first()
                .and_then(|id| {
                    id.trim()
                        .split_once('/')
                        .map(|(scope, _)| scope.trim())
                })
                .filter(|scope| !scope.is_empty())
        })
        .unwrap_or_default()
}
