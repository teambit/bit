//! The minimatch subset variant namespaces use: `*`, `**` segments, `?`,
//! `[...]` classes and `{a,b}` alternatives, without matching leading dots.

/// Whether `name` matches the minimatch `pattern`.
#[must_use]
pub fn matches(pattern: &str, name: &str) -> bool {
    let pattern = pattern.trim();
    let name = name.trim();
    expand_braces(pattern)
        .iter()
        .any(|pattern| {
            let pattern: Vec<&str> = pattern.split('/').collect();
            let name: Vec<&str> = name.split('/').collect();
            segments(&pattern, &name)
        })
}

/// `{a,b}` alternatives, expanded innermost/left-to-right.
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

fn segment_matches(pattern: &str, name: &str) -> bool {
    if name.starts_with('.') && !pattern.starts_with('.') {
        return false;
    }
    let pattern: Vec<char> = pattern.chars().collect();
    let name: Vec<char> = name.chars().collect();
    wildcard(&pattern, &name)
}

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
    let mut found = false;
    let mut index = 0;
    while index < body.len() {
        if index + 2 < body.len() && body[index + 1] == '-' {
            found |= (body[index]..=body[index + 2]).contains(&head);
            index += 3;
        } else {
            found |= body[index] == head;
            index += 1;
        }
    }
    found != negated && wildcard(&rest[close + 1..], &name[1..])
}
