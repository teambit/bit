//! The file diffs of `bit diff`: `formatFileDiff` of
//! `@teambit/legacy.component-diff`, and `diffFiles`, which runs
//! `git diff --no-index --color` on two files.

use regress::Regex;
use std::{
    fs, io,
    path::PathBuf,
    process::Command,
    sync::{
        OnceLock,
        atomic::{AtomicUsize, Ordering},
    },
};

/// `formatFileDiff(fileDiff, labelA, labelB, name)`: the diff from its
/// `--- ` line, with both file headers relabelled.
pub fn format(diff: &str, label_a: &str, label_b: &str, name: &str) -> String {
    let Some(start) = diff
        .find("--- ")
        .filter(|start| *start >= 1)
    else {
        return String::new();
    };
    let (header_a, header_b) = headers();
    let body = &diff[start..];
    let body = replace_first(body, header_a, &format!("--- {name} ({label_a})\n"));
    replace_first(&body, header_b, &format!("+++ {name} ({label_b})\n"))
}

fn headers() -> &'static (Regex, Regex) {
    static HEADERS: OnceLock<(Regex, Regex)> = OnceLock::new();
    HEADERS.get_or_init(|| {
        let compile = |source| Regex::new(source).expect("diff header regexes compile");
        (compile(r#"--- ["]?a.*\n"#), compile(r#"\+\+\+ ["]?b.*\n"#))
    })
}

/// `text.replace(regex, replacement)` with JavaScript's `$` patterns
/// (`$$`, `$&`, `` $` ``, `$'`); the regexes have no capture groups.
fn replace_first(text: &str, regex: &Regex, replacement: &str) -> String {
    let Some(found) = regex.find(text) else { return text.to_string() };
    let range = found.range();
    let (before, matched, after) = (&text[..range.start], &text[range.clone()], &text[range.end..]);
    let mut expanded = String::with_capacity(replacement.len());
    let mut chars = replacement.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '$' {
            expanded.push(c);
            continue;
        }
        match chars.peek() {
            Some('$') => expanded.push('$'),
            Some('&') => expanded.push_str(matched),
            Some('`') => expanded.push_str(before),
            Some('\'') => expanded.push_str(after),
            _ => {
                expanded.push('$');
                continue;
            }
        }
        chars.next();
    }
    format!("{before}{expanded}{after}")
}

/// `diffFiles(a, b, true)` of two texts, written to temporary `.js` files as
/// `tempy.write` does: git's stdout without its final newline.
pub fn diff_texts(left: &str, right: &str) -> io::Result<String> {
    let dir = TempDir::new()?;
    let (a, b) = (dir.0.join("a").join("config.js"), dir.0.join("b").join("config.js"));
    for (path, text) in [(&a, left), (&b, right)] {
        fs::create_dir_all(path.parent().unwrap_or(&dir.0))?;
        fs::write(path, text)?;
    }
    let output = Command::new(super::git::executable(&std::env::current_dir()?)?)
        .args(["diff", "--no-index", "--color"])
        .arg(&a)
        .arg(&b)
        .output()?;
    let stdout = String::from_utf8(output.stdout).map_err(io::Error::other)?;
    // execa rejects on a non-zero exit; `diffFiles` keeps the output of one that has it.
    if !output.status.success() && (output.status.code().is_none() || stdout.is_empty()) {
        return Err(io::Error::other("git diff failed"));
    }
    // `strip-final-newline`: one `\n`, and a `\r` before it.
    let text = stdout
        .strip_suffix('\n')
        .map_or(stdout.as_str(), |text| text.strip_suffix('\r').unwrap_or(text));
    Ok(text.to_string())
}

struct TempDir(PathBuf);

impl TempDir {
    fn new() -> io::Result<Self> {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let name = format!(
            "bit-native-diff-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed),
        );
        let dir = std::env::temp_dir().join(name);
        fs::create_dir_all(&dir)?;
        Ok(Self(dir))
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[cfg(test)]
mod files_tests;
