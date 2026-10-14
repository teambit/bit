//! Import specifiers of one component file.
//!
//! JavaScript and TypeScript go through the Oxc dependency scanner. Files it
//! reports as `unsupported` (decorators, AMD, exotic syntax) fall back to a lexical
//! scan of `import`/`export ... from`/`require(...)`. Style sheets yield their
//! `@import`/`@use`/`@forward` targets; a `~` prefix marks a package and anything
//! else is a relative file, following Sass resolution.

use std::{fs, io, path::Path};

const SCRIPT: [&str; 8] = ["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts"];
const STYLE: [&str; 4] = ["scss", "sass", "less", "css"];
const MAX_SOURCE: u64 = 1024 * 1024;

/// The import specifiers of `path`, in encounter order and without duplicates.
pub fn specifiers(path: &Path) -> io::Result<Vec<String>> {
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let is_script = SCRIPT.contains(&extension.as_str());
    let is_style = STYLE.contains(&extension.as_str());
    let is_markdown = extension == "mdx";
    if !is_script && !is_style && !is_markdown {
        return Ok(Vec::new());
    }
    let Some(source) = read(path)? else { return Ok(Vec::new()) };
    let found = if is_style {
        style(&source)
    } else if is_script {
        script(path, source)
    } else {
        lexical(&source)
    };
    Ok(dedupe(found))
}

fn read(path: &Path) -> io::Result<Option<String>> {
    match fs::metadata(path) {
        Ok(metadata) if metadata.len() > MAX_SOURCE => return Ok(None),
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    }
    let bytes = fs::read(path)?;
    Ok(String::from_utf8(bytes).ok())
}

fn script(path: &Path, source: String) -> Vec<String> {
    let lexical_fallback = lexical(&source);
    let Ok(result) =
        bit_dependency_scanner::scan_source(path.to_string_lossy().into_owned(), source)
    else {
        return lexical_fallback;
    };
    match result["status"].as_str() {
        Some("ok") => result["dependencies"]
            .as_object()
            .map(|dependencies| dependencies.keys().cloned().collect())
            .unwrap_or_default(),
        // A file Bit cannot parse yields no dependencies, like the parse-error issue.
        Some("parse_error") => Vec::new(),
        _ => lexical_fallback,
    }
}

/// `import ... from 'x'`, `import 'x'`, `export ... from 'x'`, `import('x')`, `require('x')`.
#[must_use]
pub fn lexical(source: &str) -> Vec<String> {
    let mut found = Vec::new();
    for keyword in ["from", "import", "require"] {
        let mut rest = source;
        while let Some(index) = rest.find(keyword) {
            let before = rest[..index].chars().next_back();
            let after = &rest[index + keyword.len()..];
            rest = after;
            if before.is_some_and(|character| {
                character.is_alphanumeric()
                    || character == '_'
                    || character == '$'
                    || character == '.'
            }) {
                continue;
            }
            if let Some(specifier) = quoted(
                after
                    .trim_start()
                    .strip_prefix('(')
                    .unwrap_or(after)
                    .trim_start(),
            ) {
                found.push(specifier);
            }
        }
    }
    found
}

fn style(source: &str) -> Vec<String> {
    let mut found = Vec::new();
    for keyword in ["@import", "@use", "@forward"] {
        let mut rest = source;
        while let Some(index) = rest.find(keyword) {
            rest = &rest[index + keyword.len()..];
            found.extend(quoted(rest.trim_start()).and_then(style_specifier));
        }
    }
    found
}

/// A style import target as a specifier: `~pkg` is a package, anything else a relative file.
fn style_specifier(target: String) -> Option<String> {
    if ["http:", "https:", "sass:"]
        .iter()
        .any(|prefix| target.starts_with(prefix))
    {
        return None;
    }
    Some(match target.strip_prefix('~') {
        Some(package) => package.to_owned(),
        None if target.starts_with('.') || target.starts_with('/') => target,
        None => format!("./{target}"),
    })
}

fn quoted(text: &str) -> Option<String> {
    let quote = text
        .chars()
        .next()
        .filter(|character| matches!(character, '\'' | '"' | '`'))?;
    let body = &text[1..];
    let end = body.find(quote)?;
    let specifier = &body[..end];
    (!specifier.is_empty() && !specifier.contains(['\n', '$'])).then(|| specifier.to_owned())
}

/// `found` without repeated specifiers, keeping the first occurrence.
pub fn dedupe(found: Vec<String>) -> Vec<String> {
    let mut result: Vec<String> = Vec::with_capacity(found.len());
    for specifier in found {
        if !result.contains(&specifier) {
            result.push(specifier);
        }
    }
    result
}
