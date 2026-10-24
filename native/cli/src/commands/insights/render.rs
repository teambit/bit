//! `renderCycles` from `@teambit/component-issues` for insight text reports.

use crate::commands::color::Chalk;
use std::fmt::Write as _;

const ARROW: &str = "  ───>  ";
const ARROW_LEN: usize = 8;
const MAX_HORIZONTAL_WIDTH: usize = 90;

pub(crate) fn cycles(cycles: &[Vec<String>], chalk: Chalk) -> String {
    if cycles.is_empty() {
        return "No circular dependencies found".into();
    }
    let blocks = cycles
        .iter()
        .enumerate()
        .map(|(index, cycle)| {
            let info = shorten_names(cycle);
            let header = header(index, cycles.len(), &info, chalk);
            let body = if info.names.len() == 1 {
                format!("  {}  ⟲", chalk.cyan(&info.names[0]))
            } else if horizontal_width(&info.names) <= MAX_HORIZONTAL_WIDTH {
                horizontal(&info.names, chalk)
            } else {
                vertical(&info.names, chalk)
            };
            format!("{header}\n\n{body}")
        })
        .collect::<Vec<_>>();
    format!("\n{}\n", blocks.join("\n\n"))
}

struct Shortened {
    names: Vec<String>,
    scope: Option<String>,
    version: Option<String>,
}

struct ParsedId<'a> {
    scope: Option<&'a str>,
    name: &'a str,
    version: Option<&'a str>,
}

fn shorten_names(cycle: &[String]) -> Shortened {
    let unique = &cycle[..cycle.len().saturating_sub(1)];
    let parsed = unique
        .iter()
        .map(|id| parse_id(id))
        .collect::<Vec<_>>();
    let scope = parsed
        .first()
        .and_then(|first| first.scope)
        .filter(|scope| {
            parsed
                .iter()
                .all(|entry| entry.scope == Some(*scope))
        });
    let version = parsed
        .first()
        .and_then(|first| first.version)
        .filter(|version| {
            parsed
                .iter()
                .all(|entry| entry.version == Some(*version))
        });
    let names = parsed
        .iter()
        .map(|item| display_name(item, scope, version))
        .collect();
    Shortened { names, scope: scope.map(str::to_owned), version: version.map(str::to_owned) }
}

fn parse_id(id: &str) -> ParsedId<'_> {
    let (bare, version) = id
        .rsplit_once('@')
        .map_or((id, None), |(bare, ver)| {
            if bare.is_empty() { (id, None) } else { (bare, (!ver.is_empty()).then_some(ver)) }
        });
    let (scope, name) =
        bare
            .rsplit_once('/')
            .map_or((None, bare), |(scope, name)| {
                if scope.is_empty() { (None, bare) } else { (Some(scope), name) }
            });
    ParsedId { scope, name, version }
}

fn display_name(
    item: &ParsedId<'_>,
    common_scope: Option<&str>,
    common_version: Option<&str>,
) -> String {
    let mut display = if common_scope.is_some() {
        item.name.to_owned()
    } else if let Some(scope) = item.scope {
        format!("{scope}/{}", item.name)
    } else {
        item.name.to_owned()
    };
    if common_version.is_none()
        && let Some(version) = item.version
    {
        display.push('@');
        display.push_str(version);
    }
    display
}

fn header(index: usize, total: usize, info: &Shortened, chalk: Chalk) -> String {
    let mut line =
        if total > 1 { format!("Cycle {} of {total}", index + 1) } else { "Cycle".into() };
    if info.names.len() == 1 {
        line.push_str(" - self-dependency");
    } else {
        let _ = write!(line, " - {} components", info.names.len());
    }
    if let Some(scope) = &info.scope {
        let _ = write!(line, "   (scope: {scope})");
    }
    if let Some(version) = &info.version {
        let _ = write!(line, "  @{version}");
    }
    chalk.bold(&line)
}

fn horizontal_width(names: &[String]) -> usize {
    names
        .iter()
        .map(|name| name.encode_utf16().count())
        .sum::<usize>()
        + names.len().saturating_sub(1) * ARROW_LEN
        + 6
}

fn horizontal(names: &[String], chalk: Chalk) -> String {
    let mut chain = String::new();
    for (index, name) in names.iter().enumerate() {
        if index > 0 {
            chain.push_str(&chalk.dim(ARROW));
        }
        chain.push_str(&chalk.cyan(name));
    }
    let total_width = horizontal_width(names);
    let top = format!(
        "{}{}{}",
        chalk.red("┌"),
        chalk.red(&"─".repeat(total_width.saturating_sub(2))),
        chalk.red("┐"),
    );
    let side = format!("{}{}", " ".repeat(total_width.saturating_sub(1)), chalk.red("│"));
    let arrow = format!(
        "{}{}{}",
        chalk.red("▼"),
        " ".repeat(total_width.saturating_sub(2)),
        chalk.red("│"),
    );
    let closing = chalk.red("  ───┘");
    format!("{top}\n{side}\n{arrow}\n{chain}{closing}")
}

fn vertical(names: &[String], chalk: Chalk) -> String {
    let mut lines = Vec::new();
    for (index, name) in names.iter().enumerate() {
        lines.push(chalk.cyan(name));
        if index + 1 < names.len() {
            lines.push(chalk.dim("  │"));
            lines.push(chalk.dim("  ▼"));
        }
    }
    lines.push(format!(
        "{}{}{}",
        chalk.red("  ╰───▶ "),
        chalk.cyan(&names[0]),
        chalk.dim("  (back to start)"),
    ));
    lines.join("\n")
}
