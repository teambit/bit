//! `scaffoldAgentsMd`: retain user edits and only fill the unresolved repository placeholder.
use std::{io, path::Path};
const START: &str = "<!-- bit-ci-sync:start";
const END: &str = "<!-- bit-ci-sync:end -->";
pub(super) const UNKNOWN: &str = "<org>/<this-repo>";

pub(super) fn render(scope: &str, repo: &str, branch: &str) -> String {
    let raw = include_str!("agents-section.md").replace("\r\n", "\n");
    let quoted = super::shell_word(branch);
    let values =
        [("scope", scope), ("repo", repo), ("branch", branch), ("branch-sh", quoted.as_str())];
    let mut out = String::new();
    let mut rest = raw.as_str();
    while let Some(start) = rest.find("{{") {
        out.push_str(&rest[..start]);
        let token = &rest[start..];
        if let Some((key, value)) = values
            .iter()
            .find(|(key, _)| token.starts_with(&format!("{{{{{key}}}}}")))
        {
            out.push_str(value);
            rest = &token[key.len() + 4..];
        } else {
            out.push_str("{{");
            rest = &token[2..];
        }
    }
    out.push_str(rest);
    out
}

pub(super) fn write(
    root: &Path,
    section: &str,
    repo: &str,
) -> io::Result<(&'static str, Option<&'static str>)> {
    let path = root.join("AGENTS.md");
    if !path.exists() {
        super::files::write(&path, &format!("# Agent instructions\n\n{}\n", super::trim(section)))?;
        return Ok(("written", None));
    }
    let existing = super::files::read(&path)?;
    let (content, note) = if existing.contains(START) {
        (fill_repo(&existing, repo), Some("filled in the repository in the sync rules"))
    } else {
        (insert(&existing, section), None)
    };
    if content == existing {
        return Ok(("skipped", None));
    }
    super::files::write(&path, &content)?;
    Ok(("updated", note))
}

fn fill_repo(content: &str, repo: &str) -> String {
    if repo == UNKNOWN {
        return content.to_owned();
    }
    let Some(start) = content.find(START) else {
        return content.to_owned();
    };
    let Some(relative_end) = content[start..].find(END) else {
        return content.to_owned();
    };
    let end = start + relative_end;
    format!(
        "{}{}{}",
        &content[..start],
        content[start..end].replace(UNKNOWN, repo),
        &content[end..],
    )
}

fn starts_block(line: &str) -> bool {
    regress::Regex::new(r"^\s*(#{1,6}(\s|$)|---|```|~~~|<!--|\||>|[-*+](\s|$)|\d+[.)](\s|$))")
        .ok()
        .is_some_and(|regex| regex.find(line).is_some())
}

fn insertion_point(lines: &[&str]) -> usize {
    let mut at = 0;
    if super::trim(lines[0]) == "---"
        && let Some(end) = lines
            .iter()
            .enumerate()
            .skip(1)
            .find_map(|(index, line)| matches!(super::trim(line), "---" | "...").then_some(index))
    {
        at = end + 1;
    }
    title_end(lines, at)
}
fn title_end(lines: &[&str], at: usize) -> usize {
    let mut next = at;
    skip_empty(lines, &mut next);
    let Some(title) = regress::Regex::new(r"^ {0,3}#(\s|$)").ok() else {
        return at;
    };
    if lines
        .get(next)
        .is_none_or(|line| title.find(line).is_none())
    {
        return at;
    }
    next += 1;
    skip_empty(lines, &mut next);
    if lines
        .get(next)
        .is_some_and(|line| !starts_block(line))
    {
        next += 1;
        while lines
            .get(next)
            .is_some_and(|line| !super::trim(line).is_empty() && !starts_block(line))
        {
            next += 1;
        }
    }
    next
}

fn insert(existing: &str, section: &str) -> String {
    let lines: Vec<_> = existing.split('\n').collect();
    let at = insertion_point(&lines);
    let before = lines[..at].join("\n");
    let after = lines[at..].join("\n");
    let mut parts = vec![before.trim_end_matches(super::whitespace), super::trim(section)];
    if !super::trim(&after).is_empty() {
        parts.extend(["---", super::trim(&after)]);
    }
    format!(
        "{}\n",
        parts
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join("\n\n"),
    )
}
fn skip_empty(lines: &[&str], next: &mut usize) {
    while lines
        .get(*next)
        .is_some_and(|line| super::trim(line).is_empty())
    {
        *next += 1;
    }
}
