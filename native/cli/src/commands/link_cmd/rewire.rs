//! Relative-to-module path codemod (`bit link --rewire`, `codemod-components.ts`).

use bit_install::{model::WorkspaceComponent, workspace::Workspace};
use std::{
    fs, io,
    path::{Component, Path, PathBuf},
};

const SCRIPT_EXTENSIONS: [&str; 8] = ["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts"];
const STYLE_EXTENSIONS: [&str; 4] = ["css", "scss", "less", "sass"];
const TYPESCRIPT_ORIGINS: [&str; 6] = ["ts", "tsx", "cts", "mts", "md", "mdx"];
const TYPESCRIPT_LOOKUP_EXTS: [&str; 3] = ["ts", "tsx", "d.ts"];
const COMMONJS_LOOKUP_EXTS: [&str; 15] = [
    "js", "json", "cjs", "mjs", "jsx", "ts", "tsx", "cts", "mts", "d.ts", "css", "scss", "sass",
    "styl", "less",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct CodemodResult {
    pub id: String,
    pub changed_files: Vec<String>,
}

pub(super) fn rewire_components(
    ws: &Workspace,
    selected: &[&WorkspaceComponent],
) -> io::Result<Vec<CodemodResult>> {
    let all_components: Vec<&WorkspaceComponent> = ws
        .active()
        .map(|(_, comp)| comp)
        .filter(|comp| comp.root_dir != ".")
        .collect();
    let mut results = Vec::new();
    for &component in selected {
        if component.root_dir == "." {
            continue;
        }
        let changed_files = rewire_component(component, &all_components)?;
        if !changed_files.is_empty() {
            results.push(CodemodResult {
                id: component.id.to_string_without_version(),
                changed_files,
            });
        }
    }
    Ok(results)
}

fn rewire_component(
    component: &WorkspaceComponent,
    all_components: &[&WorkspaceComponent],
) -> io::Result<Vec<String>> {
    let mut changed_files = Vec::new();
    for rel_file in &component.files {
        let file_path = component.dir.join(rel_file);
        let Some(content) = read_rewirable_file(&file_path)? else {
            continue;
        };
        let updated = rewire_file_content(&content, &file_path, component, all_components);
        if updated != content {
            fs::write(&file_path, &updated)?;
            changed_files.push(rel_file.replace('\\', "/"));
        }
    }
    Ok(changed_files)
}

fn read_rewirable_file(path: &Path) -> io::Result<Option<String>> {
    let ext = file_extension(path);
    if !SCRIPT_EXTENSIONS.contains(&ext.as_str())
        && !STYLE_EXTENSIONS.contains(&ext.as_str())
        && ext != "mdx"
    {
        return Ok(None);
    }
    match fs::read(path) {
        Ok(bytes) => Ok(String::from_utf8(bytes).ok()),
        Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err),
    }
}

fn rewire_file_content(
    content: &str,
    file_path: &Path,
    component: &WorkspaceComponent,
    all_components: &[&WorkspaceComponent],
) -> String {
    let is_style = STYLE_EXTENSIONS.contains(&file_extension(file_path).as_str());
    let specifiers = extract_specifiers(content, is_style);
    let mut current = content.to_owned();
    for specifier in specifiers {
        current = rewire_specifier(&current, &specifier, file_path, component, all_components);
    }
    current
}

fn rewire_specifier(
    current: &str,
    specifier: &str,
    file_path: &Path,
    component: &WorkspaceComponent,
    all_components: &[&WorkspaceComponent],
) -> String {
    if !(specifier.starts_with('.') || specifier.starts_with('/')) {
        return current.to_owned();
    }
    let ext = file_extension(file_path);
    let is_style = STYLE_EXTENSIONS.contains(&ext.as_str());
    let is_ts = TYPESCRIPT_ORIGINS.contains(&ext.as_str());
    let base_dir = file_path.parent().unwrap_or(&component.dir);
    let candidate = normalize_path(&base_dir.join(specifier));
    let Some(resolved) = find_resolved_file(&candidate, is_ts) else {
        return current.to_owned();
    };
    let Some(owner) = find_owner(&resolved, all_components) else {
        return current.to_owned();
    };
    if owner.id == component.id {
        return current.to_owned();
    }
    let old_name = name_without_internal_path(specifier, owner, &resolved);
    let new_name =
        if is_style { format!("~{}", owner.package_name) } else { owner.package_name.clone() };
    replace_package_name(current, &old_name, &new_name)
}

fn find_owner<'a>(
    target: &Path,
    all_components: &[&'a WorkspaceComponent],
) -> Option<&'a WorkspaceComponent> {
    all_components
        .iter()
        .copied()
        .filter(|other| target.starts_with(&other.dir) && other.root_dir != ".")
        .max_by_key(|other| other.dir.as_os_str().len())
}

fn name_without_internal_path(
    import_source: &str,
    owner: &WorkspaceComponent,
    resolved_file: &Path,
) -> String {
    let main_file = normalize_path(&owner.dir.join(&owner.main_file));
    if resolved_file == main_file {
        return import_source.to_owned();
    }
    let Ok(rel) = resolved_file.strip_prefix(&owner.dir) else {
        return import_source.to_owned();
    };
    let internal_path = rel.to_string_lossy().replace('\\', "/");
    if let Some(stripped) = strip_trailing_segment(import_source, &internal_path) {
        return stripped;
    }
    let no_ext = strip_extension(&internal_path);
    if let Some(stripped) = strip_trailing_segment(import_source, &no_ext) {
        return stripped;
    }
    if let Some(no_index) = strip_trailing_segment(&no_ext, "index")
        && let Some(stripped) = strip_trailing_segment(import_source, &no_index)
    {
        return stripped;
    }
    import_source.to_owned()
}

fn strip_trailing_segment(input: &str, segment: &str) -> Option<String> {
    if segment.is_empty() || !input.ends_with(segment) {
        return None;
    }
    let suffix = format!("/{segment}");
    input.strip_suffix(&suffix).map(str::to_owned)
}

fn strip_extension(path_str: &str) -> String {
    let path = Path::new(path_str);
    let Some(ext) = path.extension().and_then(|os| os.to_str()) else {
        return path_str.to_owned();
    };
    path_str
        .strip_suffix(&format!(".{ext}"))
        .unwrap_or(path_str)
        .to_owned()
}

pub(super) fn replace_package_name(source: &str, old_name: &str, new_name: &str) -> String {
    if old_name.is_empty() || new_name.is_empty() || old_name == new_name {
        return source.to_owned();
    }
    let mut updated = source.to_owned();
    for quote in ['\'', '"'] {
        for tilde in ["", "~"] {
            for suffix in ['/', quote] {
                let target = format!("{quote}{tilde}{old_name}{suffix}");
                let replacement = format!("{quote}{tilde}{new_name}{suffix}");
                updated = updated.replace(&target, &replacement);
            }
        }
    }
    updated
}

fn extract_specifiers(source: &str, is_style: bool) -> Vec<String> {
    let raw = if is_style {
        extract_style_specifiers(source)
    } else {
        extract_lexical_specifiers(source)
    };
    let mut unique = Vec::new();
    for item in raw {
        if !unique.contains(&item) {
            unique.push(item);
        }
    }
    unique
}

fn extract_lexical_specifiers(source: &str) -> Vec<String> {
    let mut found = Vec::new();
    for keyword in ["from", "import", "require"] {
        let mut rest = source;
        while let Some(index) = rest.find(keyword) {
            let before = rest[..index].chars().next_back();
            let after = &rest[index + keyword.len()..];
            rest = after;
            if before.is_some_and(is_ident_char) {
                continue;
            }
            let trimmed = after
                .trim_start()
                .strip_prefix('(')
                .unwrap_or(after)
                .trim_start();
            if let Some(specifier) = parse_quoted(trimmed) {
                found.push(specifier);
            }
        }
    }
    found
}

fn is_ident_char(character: char) -> bool {
    character.is_alphanumeric() || character == '_' || character == '$' || character == '.'
}

fn extract_style_specifiers(source: &str) -> Vec<String> {
    let mut found = Vec::new();
    for keyword in ["@import", "@use", "@forward"] {
        let mut rest = source;
        while let Some(index) = rest.find(keyword) {
            rest = &rest[index + keyword.len()..];
            found.extend(parse_style_target(rest));
        }
    }
    found
}

fn parse_style_target(after_keyword: &str) -> Option<String> {
    let target = parse_quoted(after_keyword.trim_start())?;
    if ["~", "http:", "https:", "sass:"]
        .iter()
        .any(|prefix| target.starts_with(prefix))
    {
        return None;
    }
    if target.starts_with('.') || target.starts_with('/') {
        Some(target)
    } else {
        Some(format!("./{target}"))
    }
}

fn parse_quoted(input: &str) -> Option<String> {
    let quote = input
        .chars()
        .next()
        .filter(|&ch| ch == '\'' || ch == '"')?;
    let rest = &input[quote.len_utf8()..];
    let end = rest.find(quote)?;
    let value = rest[..end].trim();
    (!value.is_empty() && !value.contains('\n')).then(|| value.to_owned())
}

fn find_resolved_file(target: &Path, is_ts: bool) -> Option<PathBuf> {
    if target.is_file() {
        return Some(target.to_path_buf());
    }
    if is_ts && let Some(found) = typescript_lookup(target) {
        return Some(found);
    }
    with_extensions(target, &COMMONJS_LOOKUP_EXTS)
        .or_else(|| with_extensions(&target.join("index"), &COMMONJS_LOOKUP_EXTS))
}

fn typescript_lookup(target: &Path) -> Option<PathBuf> {
    let stem = strip_script_ext(target);
    let base = stem.as_deref().unwrap_or(target);
    with_extensions(base, &TYPESCRIPT_LOOKUP_EXTS)
        .or_else(|| with_extensions(&target.join("index"), &TYPESCRIPT_LOOKUP_EXTS))
}

fn strip_script_ext(target: &Path) -> Option<PathBuf> {
    let ext = target.extension()?.to_str()?;
    ["js", "jsx", "mjs", "cjs"]
        .contains(&ext)
        .then(|| target.with_extension(""))
}

fn with_extensions(base: &Path, extensions: &[&str]) -> Option<PathBuf> {
    extensions
        .iter()
        .map(|ext| PathBuf::from(format!("{}.{ext}", base.display())))
        .find(|candidate| candidate.is_file())
}

fn file_extension(path: &Path) -> String {
    path.extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for part in path.components() {
        match part {
            Component::ParentDir => {
                normalized.pop();
            }
            Component::CurDir => {}
            other => normalized.push(other),
        }
    }
    normalized
}
