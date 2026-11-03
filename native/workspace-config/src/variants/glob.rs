//! The `minimatch` subset variant namespaces use via [`matches`]: `*`, `**` segments, `?`,
//! `[...]` classes, and `{a,b}` alternatives, without matching leading dots.

/// Whether `name` (`/`-separated namespace) matches the `minimatch` `pattern` via [`segments`] and [`expand_braces`].
#[must_use]
#[inline]
pub fn matches(pattern: &str, name: &str) -> bool {
    let pattern = pattern.trim();
    let name = name.trim();
    if pattern.is_empty() || name.is_empty() {
        return false;
    }
    let name: Vec<&str> = name.split('/').collect();
    if !pattern.contains('{') {
        let pattern: Vec<&str> = pattern.split('/').collect();
        return segments(&pattern, &name);
    }
    expand_braces(pattern)
        .iter()
        .any(|pattern| {
            let pattern: Vec<&str> = pattern.split('/').collect();
            segments(&pattern, &name)
        })
}

/// `{a,b}` alternatives in `pattern`, expanded innermost/left-to-right via [`find_comma_brace_pair`].
#[inline]
fn expand_braces(pattern: &str) -> Vec<String> {
    let Some((open, close)) = find_comma_brace_pair(pattern) else {
        return vec![pattern.to_owned()];
    };
    let inner = &pattern[open + 1..close];
    inner
        .split(',')
        .flat_map(|choice| {
            expand_braces(&format!("{}{choice}{}", &pattern[..open], &pattern[close + 1..]))
        })
        .collect()
}

/// Finds the innermost `{...}` brace pair in `pattern` that contains at least one comma.
#[inline]
fn find_comma_brace_pair(pattern: &str) -> Option<(usize, usize)> {
    let mut opens = Vec::new();
    for (index, character) in pattern.char_indices() {
        if character == '{' {
            opens.push(index);
        } else if character == '}'
            && let Some(open) = opens.pop()
            && pattern[open + 1..index].contains(',')
        {
            return Some((open, index));
        }
    }
    None
}

/// Matches `/`-split `pattern` segments against `name` segments via [`segment_matches`] with `**` recursion.
#[inline]
fn segments(pattern: &[&str], name: &[&str]) -> bool {
    match (pattern.split_first(), name.split_first()) {
        (None, None) => true,
        (Some((&"**", rest)), _) => {
            segments(rest, name)
                || name
                    .split_first()
                    .is_some_and(|(head, tail)| !head.starts_with('.') && segments(pattern, tail))
        }
        (Some((segment, rest)), Some((head, tail))) => {
            segment_matches(segment, head) && segments(rest, tail)
        }
        _ => false,
    }
}

/// Matches a single `/`-delimited `pattern` segment against `name`, rejecting leading-dot mismatches.
#[inline]
fn segment_matches(pattern: &str, name: &str) -> bool {
    if name.starts_with('.') && !pattern.starts_with('.') {
        return false;
    }
    let pattern: Vec<char> = pattern.chars().collect();
    let name: Vec<char> = name.chars().collect();
    wildcard(&pattern, &name)
}

/// Matches character slice `pattern` against `name` supporting `*`, `?`, `[...]`, and `\` escapes.
#[inline]
fn wildcard(pattern: &[char], name: &[char]) -> bool {
    match pattern.split_first() {
        None => name.is_empty(),
        Some(('*', rest)) => (0..=name.len()).any(|skip| wildcard(rest, &name[skip..])),
        Some(('?', rest)) => !name.is_empty() && wildcard(rest, &name[1..]),
        Some(('[', rest)) => class(rest, name),
        Some(('\\', rest)) if !rest.is_empty() => {
            name.first() == Some(&rest[0]) && wildcard(&rest[1..], &name[1..])
        }
        Some((char, rest)) => name.first() == Some(char) && wildcard(rest, &name[1..]),
    }
}

/// `[abc]`, `[a-z]`, `[!x]`/`[^x]`; an unclosed `[` is literal.
#[inline]
fn class(rest: &[char], name: &[char]) -> bool {
    let Some(close) = rest
        .iter()
        .skip(1)
        .position(|char| *char == ']')
        .map(|index| index + 1)
    else {
        return name.first() == Some(&'[') && wildcard(rest, &name[1..]);
    };
    let Some(&head) = name.first() else { return false };
    let (negated, body) = match rest[0] {
        '!' | '^' => (true, &rest[1..close]),
        _ => (false, &rest[..close]),
    };
    let Some(found) = match_class_body(body, head) else {
        return head == '[' && wildcard(rest, &name[1..]);
    };
    found != negated && wildcard(&rest[close + 1..], &name[1..])
}

#[inline]
fn match_class_body(body: &[char], head: char) -> Option<bool> {
    let mut found = false;
    let mut index = 0;
    while index < body.len() {
        if index + 2 < body.len() && body[index + 1] == '-' {
            if body[index] > body[index + 2] {
                return None;
            }
            found |= (body[index]..=body[index + 2]).contains(&head);
            index += 3;
        } else {
            found |= body[index] == head;
            index += 1;
        }
    }
    Some(found)
}
