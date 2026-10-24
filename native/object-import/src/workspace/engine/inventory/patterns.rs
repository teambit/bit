use super::{Matcher, invalid};
use rayon::{ThreadPool, prelude::*};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    io::{self, Read},
    path::Path,
};

#[derive(Serialize)]
pub(super) struct Nested {
    directory: String,
    patterns: Vec<String>,
}
pub(super) fn nested(
    root: &Path,
    paths: &[String],
    policy: &mut Matcher,
    pool: &ThreadPool,
) -> io::Result<Vec<Nested>> {
    let directories = directories(paths, policy);
    let nested = pool.install(|| {
        directories
            .par_iter()
            .map(|(directory, name)| {
                let patterns = read(&root.join(directory).join(name), name == ".gitignore")?;
                Ok(Nested { directory: directory.clone(), patterns })
            })
            .collect::<io::Result<Vec<_>>>()
    })?;
    if nested
        .iter()
        .flat_map(|row| &row.patterns)
        .map(String::len)
        .sum::<usize>()
        > 1024 * 1024
    {
        return Err(invalid("inventory nested ignore bytes limit"));
    }
    Ok(nested
        .into_iter()
        .filter(|row| !row.patterns.is_empty())
        .collect())
}
fn directories(paths: &[String], policy: &mut Matcher) -> Vec<(String, String)> {
    let mut selected: Vec<(String, String)> = Vec::new();
    let mut positions = HashMap::new();
    for path in paths {
        let Some((directory, name)) = path.rsplit_once('/') else { continue };
        if !matches!(name, ".gitignore" | ".bitignore") || !policy.keep(&format!("{directory}/")) {
            continue;
        }
        let index = *positions
            .entry(directory)
            .or_insert_with(|| {
                selected.push((directory.to_owned(), name.to_owned()));
                selected.len() - 1
            });
        if name == ".bitignore" {
            name.clone_into(&mut selected[index].1);
        }
    }
    selected.sort_by_key(|(directory, _)| directory.split('/').count());
    selected
}
pub(in crate::workspace::engine) fn own(root: &Path) -> io::Result<Vec<String>> {
    let bit = root.join(".bitignore");
    if fs::metadata(&bit).is_ok() {
        read(&bit, false)
    } else {
        read(&root.join(".gitignore"), true)
    }
}
fn read(path: &Path, missing: bool) -> io::Result<Vec<String>> {
    let input = match fs::File::open(path) {
        Ok(input) => input,
        Err(error) if missing && error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    let metadata = input.metadata()?;
    if !metadata.is_file() || metadata.len() > 65536 {
        return Err(invalid("inventory ignore file limit"));
    }
    let mut bytes = Vec::new();
    input.take(65537).read_to_end(&mut bytes)?;
    if bytes.len() > 65536 {
        return Err(invalid("inventory ignore file limit"));
    }
    Ok(parse(&String::from_utf8_lossy(&bytes)))
}
fn parse(text: &str) -> Vec<String> {
    text.split_inclusive('\n')
        .map(|line| {
            line.strip_suffix('\n')
                .map_or(line, |line| line.strip_suffix('\r').unwrap_or(line))
        })
        .filter(|line| !line.starts_with('#') && !line.trim_matches(js_space).is_empty())
        .map(str::to_owned)
        .collect()
}
fn js_space(character: char) -> bool {
    matches!(
        character,
        '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}',
    )
}
