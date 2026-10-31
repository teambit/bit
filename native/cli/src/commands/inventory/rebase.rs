//! `rebaseIgnorePattern` of `component-map.ts`: a nested `.gitignore` or
//! `.bitignore` pattern, made relative to the workspace.

/// `pattern` from the ignore file in `dir` (a Linux-style relative path).
pub fn pattern(pattern: &str, dir: &str) -> String {
    let (negated, body) = match pattern.strip_prefix('!') {
        Some(body) => (true, body),
        None => (false, pattern),
    };
    let anchored = body
        .char_indices()
        .any(|(index, character)| character == '/' && index + 1 < body.len());
    // A trailing slash means "directories only"; the join drops it, so it is put back.
    let dir_only = if body.ends_with('/') { "/" } else { "" };
    let base = if anchored {
        join_linux(&[dir, body.strip_prefix('/').unwrap_or(body)])
    } else {
        join_linux(&[dir, "**", body])
    };
    let rebased = format!("{base}{dir_only}");
    if negated { format!("!{rebased}") } else { rebased }
}

/// `pathJoinLinux`: `path.join`, then `normalize-path`, which uses forward
/// slashes and drops a trailing one. On Windows `path.join` also splits on
/// backslashes.
pub fn join_linux(parts: &[&str]) -> String {
    let joined = parts
        .iter()
        .map(|part| part.trim())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("/");
    let joined = if cfg!(windows) { joined.replace('\\', "/") } else { joined };
    let normalized = normalize(&joined);
    match normalized.strip_suffix('/') {
        Some(trimmed) if !trimmed.is_empty() => trimmed.to_string(),
        _ => normalized,
    }
}

/// `path.posix.normalize`.
pub fn normalize(path: &str) -> String {
    if path.is_empty() {
        return ".".to_string();
    }
    let absolute = path.starts_with('/');
    let trailing = path.ends_with('/');
    let segments = path
        .split('/')
        .fold(Vec::new(), |segments, segment| resolve(segments, segment, absolute));
    let mut normalized = segments.join("/");
    if normalized.is_empty() && !absolute {
        normalized.push('.');
    }
    if trailing && !normalized.is_empty() {
        normalized.push('/');
    }
    if absolute { format!("/{normalized}") } else { normalized }
}

/// One segment of `path.posix.normalize`: `.` and empty segments vanish,
/// `..` removes its parent, or stays when a relative path climbs above its start.
fn resolve<'path>(
    mut segments: Vec<&'path str>,
    segment: &'path str,
    absolute: bool,
) -> Vec<&'path str> {
    let climbs = segments
        .last()
        .is_none_or(|last| *last == "..");
    match segment {
        "" | "." => {}
        ".." if !climbs => {
            segments.pop();
        }
        ".." if absolute => {}
        _ => segments.push(segment),
    }
    segments
}

#[cfg(test)]
mod rebase_tests;
