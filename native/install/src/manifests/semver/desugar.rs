//! The range desugaring of npm's `semver` (`replaceCaret`, `replaceTilde`,
//! `replaceXRange`, `replaceStars`, `hyphenReplace`). semver 6 and 7 differ
//! only in the `-0` suffix 7 appends to exclusive upper bounds.

use super::{
    Flavor,
    re::{Token, replace_first, split_whitespace},
};

fn is_x(id: Option<&str>) -> bool {
    id.is_none_or(|id| {
        let trimmed = id.trim();
        trimmed.is_empty() || trimmed.eq_ignore_ascii_case("x") || trimmed == "*"
    })
}

/// `+id + 1` for a numeric identifier.
fn next(id: Option<&str>) -> u64 {
    id.and_then(|id| id.trim().parse::<u64>().ok())
        .unwrap_or(0)
        .saturating_add(1)
}

/// `^…` and `~…` share the `[M, m, p, pr]` capture layout.
struct Parts<'a> {
    major: &'a str,
    minor: Option<&'a str>,
    patch: Option<&'a str>,
    pre: Option<&'a str>,
}

impl<'a> Parts<'a> {
    fn new(groups: &[Option<&'a str>], offset: usize) -> Self {
        let group = |index: usize| {
            groups
                .get(index)
                .copied()
                .flatten()
                .map(str::trim)
        };
        Parts {
            major: group(offset).unwrap_or_default(),
            minor: group(offset + 1),
            patch: group(offset + 2),
            pre: group(offset + 3).filter(|pre| !pre.is_empty()),
        }
    }

    fn lower(&self) -> String {
        let (major, minor, patch) =
            (self.major, self.minor.unwrap_or("0"), self.patch.unwrap_or("0"));
        match self.pre {
            Some(pre) => format!(">={major}.{minor}.{patch}-{pre}"),
            None => format!(">={major}.{minor}.{patch}"),
        }
    }
}

fn caret(parts: &Parts<'_>, suffix: &str) -> String {
    let (major, minor) = (parts.major, parts.minor.unwrap_or_default());
    if is_x(Some(major)) {
        return String::new();
    }
    if is_x(parts.minor) {
        return format!(">={major}.0.0 <{}.0.0{suffix}", next(Some(major)));
    }
    if is_x(parts.patch) {
        let upper = if major == "0" {
            format!("{major}.{}.0", next(Some(minor)))
        } else {
            format!("{}.0.0", next(Some(major)))
        };
        return format!(">={major}.{minor}.0 <{upper}{suffix}");
    }
    let upper = match (major, minor) {
        ("0", "0") => format!("{major}.{minor}.{}", next(parts.patch)),
        ("0", _) => format!("{major}.{}.0", next(Some(minor))),
        _ => format!("{}.0.0", next(Some(major))),
    };
    format!("{} <{upper}{suffix}", parts.lower())
}

fn tilde(parts: &Parts<'_>, suffix: &str) -> String {
    let (major, minor) = (parts.major, parts.minor.unwrap_or_default());
    if is_x(Some(major)) {
        return String::new();
    }
    if is_x(parts.minor) {
        return format!(">={major}.0.0 <{}.0.0{suffix}", next(Some(major)));
    }
    if is_x(parts.patch) {
        return format!(">={major}.{minor}.0 <{major}.{}.0{suffix}", next(Some(minor)));
    }
    format!("{} <{major}.{}.0{suffix}", parts.lower(), next(Some(minor)))
}

fn each_token(comp: &str, token: Token, replace: impl Fn(&Parts<'_>) -> String) -> String {
    split_whitespace(comp.trim())
        .into_iter()
        .map(|part| replace_first(token, part, |groups| replace(&Parts::new(groups, 1))))
        .collect::<Vec<_>>()
        .join(" ")
}

/// `>1.x` / `<=1.2.x`: `>` becomes `>=` and `<=` becomes `<` on the next major or minor.
fn xrange_with_operator(operator: &str, groups: &[Option<&str>], suffix: &str) -> String {
    let x_minor = is_x(groups[3]);
    let major = groups[2].unwrap_or_default();
    let minor = if x_minor { "0" } else { groups[3].unwrap_or_default() };
    let (operator, bump) = match operator {
        ">" => (">=", true),
        "<=" => ("<", true),
        operator => (operator, false),
    };
    let (major, minor) = match (bump, x_minor) {
        (false, _) => (major.to_string(), minor.to_string()),
        (true, true) => (next(Some(major)).to_string(), minor.to_string()),
        (true, false) => (major.to_string(), next(Some(minor)).to_string()),
    };
    let pre = if operator == "<" { suffix } else { "" };
    format!("{operator}{major}.{minor}.0{pre}")
}

/// `1.x` / `1.2.x` without an operator.
fn xrange_without_operator(matched: &str, groups: &[Option<&str>], suffix: &str) -> String {
    let major = groups[2].unwrap_or_default();
    if is_x(groups[3]) {
        return format!(">={major}.0.0 <{}.0.0{suffix}", next(Some(major)));
    }
    if is_x(groups[4]) {
        let minor = groups[3].unwrap_or_default();
        return format!(">={major}.{minor}.0 <{major}.{}.0{suffix}", next(Some(minor)));
    }
    matched.to_string()
}

fn xrange(matched: &str, groups: &[Option<&str>], suffix: &str) -> String {
    let any_x = is_x(groups[2]) || is_x(groups[3]) || is_x(groups[4]);
    let operator = match groups[1].unwrap_or_default() {
        "=" if any_x => "",
        operator => operator,
    };
    if is_x(groups[2]) {
        return if operator == ">" || operator == "<" { "<0.0.0-0" } else { "*" }.to_string();
    }
    if !operator.is_empty() && any_x {
        return xrange_with_operator(operator, groups, suffix);
    }
    xrange_without_operator(matched, groups, suffix)
}

fn replace_xranges(comp: &str, suffix: &str) -> String {
    split_whitespace(comp)
        .into_iter()
        .map(|part| {
            let part = part.trim();
            replace_first(Token::Xrange, part, |groups| {
                xrange(groups[0].unwrap_or_default(), groups, suffix)
            })
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// `parseComparator`: carets, tildes, x-ranges, then stars.
pub(super) fn parse_comparator(comp: &str, flavor: Flavor) -> String {
    let suffix = flavor.upper_suffix();
    let comp = each_token(comp, Token::Caret, |parts| caret(parts, suffix));
    let comp = each_token(&comp, Token::Tilde, |parts| tilde(parts, suffix));
    let comp = replace_xranges(&comp, suffix);
    replace_first(Token::Star, comp.trim(), |_| String::new())
}

fn hyphen_from(groups: &[Option<&str>]) -> String {
    let (major, minor) = (groups[2], groups[3]);
    if is_x(major) {
        String::new()
    } else if is_x(minor) {
        format!(">={}.0.0", major.unwrap_or_default())
    } else if is_x(groups[4]) {
        format!(">={}.{}.0", major.unwrap_or_default(), minor.unwrap_or_default())
    } else {
        format!(">={}", groups[1].unwrap_or_default())
    }
}

fn hyphen_to(groups: &[Option<&str>], suffix: &str) -> String {
    let (major, minor, patch) = (groups[8], groups[9], groups[10]);
    let (major_text, minor_text) = (major.unwrap_or_default(), minor.unwrap_or_default());
    if is_x(major) {
        String::new()
    } else if is_x(minor) {
        format!("<{}.0.0{suffix}", next(major))
    } else if is_x(patch) {
        format!("<{major_text}.{}.0{suffix}", next(minor))
    } else if let Some(pre) = groups[11].filter(|pre| !pre.is_empty()) {
        format!("<={major_text}.{minor_text}.{}-{pre}", patch.unwrap_or_default())
    } else {
        format!("<={}", groups[7].unwrap_or_default())
    }
}

/// `range.replace(re[HYPHENRANGE], hyphenReplace)`.
pub(super) fn replace_hyphen(range: &str, flavor: Flavor) -> String {
    replace_first(Token::HyphenRange, range, |groups| {
        format!("{} {}", hyphen_from(groups), hyphen_to(groups, flavor.upper_suffix()))
            .trim()
            .to_string()
    })
}
