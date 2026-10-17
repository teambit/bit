use super::{error, paths, unsupported};
use std::{io, path::Path};
const EXTENSIONS: &[&str] =
    &["js", "ts", "jsx", "tsx", "cjs", "mjs", "mts", "cts", "css", "scss", "less", "sass"];
pub(super) fn choose(
    id: &str,
    directory: &str,
    files: &[String],
    explicit: Option<&str>,
    existing: Option<&str>,
) -> io::Result<String> {
    if explicit.is_none()
        && let Some(existing) = existing
    {
        return Ok(existing.into());
    }
    if let Some(explicit) = explicit {
        if let Some(found) = find(explicit, directory, files) {
            return Ok(found);
        }
        return Err(missing(id));
    }
    if directory == "."
        && files
            .iter()
            .any(|file| file == "workspace.jsonc")
    {
        return Ok("workspace.jsonc".into());
    }
    if files.len() == 1 {
        return Ok(files[0].clone());
    }
    inferred(directory, files).ok_or_else(|| missing(id))
}

fn inferred(directory: &str, files: &[String]) -> Option<String> {
    for name in [
        "index",
        directory
            .rsplit('/')
            .next()
            .unwrap_or_default(),
    ] {
        for extension in EXTENSIONS {
            if let Some(found) = find(&format!("{name}.{extension}"), directory, files) {
                return Some(found);
            }
        }
    }
    for name in ["public-api.ts", "public_api.ts"] {
        if let Some(found) = find(name, directory, files) {
            return Some(found);
        }
    }
    None
}
fn find(name: &str, directory: &str, files: &[String]) -> Option<String> {
    if let Some(found) = files
        .iter()
        .find(|file| file.as_str() == name)
    {
        return Some(found.clone());
    }
    if let Some(found) = files
        .iter()
        .find(|file| format!("{directory}/{file}") == name)
    {
        return Some(found.clone());
    }
    files
        .iter()
        .filter(|file| Path::new(file).file_name().and_then(|name| name.to_str()) == Some(name))
        .min_by_key(|file| file.matches('/').count())
        .cloned()
}
pub(super) fn resolve(
    root: &Path,
    cwd: &Path,
    main: Option<&str>,
    files: &[String],
) -> io::Result<Option<String>> {
    let Some(main) = main else {
        return Ok(None);
    };
    let main = resolve_dsl(main, files)?;
    let absolute = paths::normalize(&cwd.join(&main));
    if absolute.is_dir() {
        return Err(error(format!(
            "error: the specified main path {} is a directory, please specify a file or a pattern DSL",
            absolute.display(),
        )));
    }
    if absolute.is_file() {
        let relative = paths::relative(root, &absolute)?;
        let folded = relative.to_lowercase();
        let found = files
            .iter()
            .find(|file| file.to_lowercase() == folded);
        return Ok(Some(found.cloned().unwrap_or(relative)));
    }
    Ok(Some(main))
}
fn resolve_dsl(main: &str, files: &[String]) -> io::Result<String> {
    let mut main = main.to_owned();
    if main.contains('{') {
        for file in files {
            let generated = format_dsl(&main, file);
            if let Some(found) = files
                .iter()
                .find(|file| file.eq_ignore_ascii_case(&generated))
            {
                main.clone_from(found);
                break;
            }
        }
        if main.contains('{') {
            return Err(unsupported("tracking unresolved main DSL"));
        }
    }
    Ok(main)
}

fn format_dsl(main: &str, file: &str) -> String {
    let path = Path::new(file);
    main.replace(
        "{FILE_NAME}",
        path.file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or_default(),
    )
    .replace(
        "{PARENT}",
        path.parent()
            .and_then(Path::file_name)
            .and_then(|name| name.to_str())
            .unwrap_or_default(),
    )
    .replace(
        "{EXT}",
        path.extension()
            .and_then(|name| name.to_str())
            .unwrap_or_default(),
    )
}

fn missing(id: &str) -> io::Error {
    error(format!(
        "error: the component {id} does not contain a main file.\nplease either use --id to group all added files as one component or use our DSL to define the main file dynamically.\nsee troubleshooting at https://bit.dev/components/component-main-file",
    ))
}
