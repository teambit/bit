//! The subset of `minimatch` dev-file patterns use: `**`, `*`, `?`, `[...]`,
//! `{a,b}` and the extglobs `+(..)`, `*(..)`, `?(..)`, `@(..)`, `!(..)`.
//! Like minimatch's defaults, wildcards never match a leading `.`.

/// `matchPatterns(file, splitPatterns(patterns))` of `@teambit/toolbox.path.match-patterns`:
/// matches an include pattern and no `!`-prefixed exclude pattern.
#[must_use]
pub fn match_patterns(file: &str, patterns: &[String]) -> bool {
    let (excludes, includes): (Vec<&str>, Vec<&str>) = patterns
        .iter()
        .map(String::as_str)
        .map(str::trim)
        .filter(|pattern| !pattern.is_empty())
        .partition(|pattern| pattern.starts_with('!'));
    includes.iter().any(|pattern| matches(pattern, file))
        && excludes
            .iter()
            .all(|pattern| !matches(pattern[1..].trim_start(), file))
}

/// Whether `path` (`/`-separated, relative) matches `pattern`.
#[must_use]
pub fn matches(pattern: &str, path: &str) -> bool {
    let segments: Vec<&str> = path.split('/').collect();
    expand_braces(pattern)
        .iter()
        .any(|pattern| {
            let parts: Vec<&str> = pattern.split('/').collect();
            match_parts(&parts, &segments)
        })
}

fn match_parts(parts: &[&str], segments: &[&str]) -> bool {
    match parts.split_first() {
        None => segments.is_empty(),
        Some((&"**", rest)) => (0..=segments.len()).any(|skip| {
            segments[..skip]
                .iter()
                .all(|segment| !segment.starts_with('.'))
                && match_parts(rest, &segments[skip..])
        }),
        Some((part, rest)) => segments
            .split_first()
            .is_some_and(|(segment, others)| {
                match_segment(part, segment) && match_parts(rest, others)
            }),
    }
}

fn match_segment(pattern: &str, segment: &str) -> bool {
    if segment.starts_with('.') && !pattern.starts_with('.') {
        return false;
    }
    let pattern: Vec<char> = pattern.chars().collect();
    let text: Vec<char> = segment.chars().collect();
    glob(&pattern, &text)
}

fn glob(pattern: &[char], text: &[char]) -> bool {
    let Some((&first, rest)) = pattern.split_first() else { return text.is_empty() };
    if let Some(close) = extglob_end(pattern) {
        return extglob(first, &pattern[2..close], &pattern[close + 1..], text);
    }
    match first {
        '*' => (0..=text.len()).any(|skip| glob(rest, &text[skip..])),
        '?' => !text.is_empty() && glob(rest, &text[1..]),
        '[' => class(pattern, text),
        '\\' if !rest.is_empty() => literal(&rest[1..], rest[0], text),
        other => literal(rest, other, text),
    }
}

fn literal(rest: &[char], character: char, text: &[char]) -> bool {
    text.first() == Some(&character) && glob(rest, &text[1..])
}

/// Index of the `)` closing an extglob that starts at `pattern[0]`.
fn extglob_end(pattern: &[char]) -> Option<usize> {
    if pattern.len() < 3 || pattern[1] != '(' || !matches!(pattern[0], '+' | '*' | '?' | '@' | '!')
    {
        return None;
    }
    let mut depth = 0;
    for (index, character) in pattern.iter().enumerate().skip(1) {
        match character {
            '(' => depth += 1,
            ')' if depth == 1 => return Some(index),
            ')' => depth -= 1,
            _ => {}
        }
    }
    None
}

fn extglob(kind: char, body: &[char], rest: &[char], text: &[char]) -> bool {
    let alternatives = split_alternatives(body);
    match kind {
        '!' => {
            !alternatives
                .iter()
                .any(|alternative| {
                    let mut excluded = alternative.clone();
                    excluded.extend_from_slice(rest);
                    glob(&excluded, text)
                })
                && (0..=text.len()).any(|split| glob(rest, &text[split..]))
        }
        '?' => glob(rest, text) || one_then(&alternatives, rest, text),
        '@' => one_then(&alternatives, rest, text),
        '*' => glob(rest, text) || repeat(&alternatives, rest, text),
        _ => repeat(&alternatives, rest, text),
    }
}

fn one_then(alternatives: &[Vec<char>], rest: &[char], text: &[char]) -> bool {
    (0..=text.len()).any(|split| {
        alternatives
            .iter()
            .any(|alternative| glob(alternative, &text[..split]))
            && glob(rest, &text[split..])
    })
}

/// One or more alternatives followed by `rest`.
fn repeat(alternatives: &[Vec<char>], rest: &[char], text: &[char]) -> bool {
    (1..=text.len()).any(|split| {
        alternatives
            .iter()
            .any(|alternative| glob(alternative, &text[..split]))
            && (glob(rest, &text[split..]) || repeat(alternatives, rest, &text[split..]))
    })
}

fn split_alternatives(body: &[char]) -> Vec<Vec<char>> {
    let mut alternatives = vec![Vec::new()];
    let mut depth = 0;
    for &character in body {
        match character {
            '|' if depth == 0 => alternatives.push(Vec::new()),
            '(' => depth += 1,
            ')' => depth -= 1,
            _ => {}
        }
        if (character != '|' || depth != 0)
            && let Some(last) = alternatives.last_mut()
        {
            last.push(character);
        }
    }
    alternatives
}

fn class(pattern: &[char], text: &[char]) -> bool {
    let Some(end) = pattern
        .iter()
        .skip(2)
        .position(|character| *character == ']')
        .map(|index| index + 2)
    else {
        return text.first() == Some(&'[') && glob(&pattern[1..], &text[1..]);
    };
    let Some(&character) = text.first() else { return false };
    let (negated, body) = match pattern[1] {
        '!' | '^' => (true, &pattern[2..end]),
        _ => (false, &pattern[1..end]),
    };
    let Some(found) = in_class(body, character) else {
        return literal(&pattern[1..], '[', text);
    };
    found != negated && glob(&pattern[end + 1..], &text[1..])
}

fn in_class(body: &[char], character: char) -> Option<bool> {
    let mut index = 0;
    let mut found = false;
    while let Some(start) = body.get(index) {
        if body.get(index + 1) == Some(&'-') && index + 2 < body.len() {
            let end = body[index + 2];
            if *start > end {
                return None;
            }
            found |= (*start..=end).contains(&character);
            index += 3;
        } else {
            found |= *start == character;
            index += 1;
        }
    }
    Some(found)
}

/// `{a,b}` brace expansion, applied before matching.
fn expand_braces(pattern: &str) -> Vec<String> {
    let Some((open, close, commas)) = find_brace_group(pattern) else {
        return vec![pattern.to_owned()];
    };
    let bounds: Vec<usize> = std::iter::once(open)
        .chain(commas)
        .chain(std::iter::once(close))
        .collect();
    bounds
        .windows(2)
        .flat_map(|window| {
            let expanded = format!(
                "{}{}{}",
                &pattern[..open],
                &pattern[window[0] + 1..window[1]],
                &pattern[close + 1..],
            );
            expand_braces(&expanded)
        })
        .collect()
}

fn find_brace_group(pattern: &str) -> Option<(usize, usize, Vec<usize>)> {
    for (open, _) in pattern.match_indices('{') {
        let mut depth = 0;
        let mut commas = Vec::new();
        for (index, character) in pattern[open..].char_indices() {
            match character {
                '{' => depth += 1,
                '}' if depth == 1 && !commas.is_empty() => {
                    return Some((open, open + index, commas));
                }
                '}' if depth == 1 => break,
                '}' => depth -= 1,
                ',' if depth == 1 => commas.push(open + index),
                _ => {}
            }
        }
    }
    None
}
