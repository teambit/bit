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
    if options.scope_fork {
        let scope = target_scope(options, ids);
        format!("forked {} into {}", chalk.bold(&options.source), chalk.bold(scope))
    } else if options.multiple() {
        format!(
            "forked {} component(s) matching pattern {}",
            ids.len(),
            chalk.bold(&options.source),
        )
    } else {
        format!("forked {} from {}", chalk.bold(&ids[0]), chalk.bold(&options.source))
    }
}
fn target_scope<'a>(options: &'a Options, ids: &'a [String]) -> &'a str {
    options.scope
        .as_deref()
        .or_else(|| {
            ids.first()
                .and_then(|id| id.split_once('/').map(|(scope, _)| scope))
        })
        .unwrap_or_default()
}
