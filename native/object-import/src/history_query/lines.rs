//! The default jsdiff line tokenizer and Myers path tie-break, without Git blame semantics.
use super::invalid;
use std::{collections::HashMap, io};

#[derive(Clone)]
struct Run {
    kind: u8,
    count: usize,
}
#[derive(Clone)]
struct Path {
    old: isize,
    runs: Vec<Run>,
}
pub(super) struct Part {
    pub(super) kind: u8,
    pub(super) value: String,
}
fn tokens(text: &str) -> Vec<&str> {
    text.split_inclusive('\n')
        .filter(|text| !text.is_empty())
        .collect()
}
pub(super) fn diff(old: &str, new: &str) -> io::Result<Vec<Part>> {
    let old = tokens(old);
    let new = tokens(new);
    if old.len() + new.len() > 65536 {
        return Err(invalid("history line count limit"));
    }
    let mut seed = Path { old: -1, runs: Vec::new() };
    common(&mut seed, &old, &new, 0);
    if terminal(&seed, 0, old.len(), new.len()) {
        return Ok(values(seed.runs, &old, &new));
    }
    let mut paths = HashMap::from([(0isize, seed)]);
    let mut work = 0;
    for distance in 1..=old.len() + new.len() {
        for diagonal in (-(distance as isize)..=distance as isize).step_by(2) {
            if let Some(runs) = step(&mut paths, diagonal, &old, &new, &mut work)? {
                return Ok(values(runs, &old, &new));
            }
        }
    }
    Err(invalid("history line diff incomplete"))
}
fn step(
    paths: &mut HashMap<isize, Path>,
    diagonal: isize,
    old: &[&str],
    new: &[&str],
    work: &mut usize,
) -> io::Result<Option<Vec<Run>>> {
    let remove = paths.remove(&(diagonal - 1));
    let add = paths.get(&(diagonal + 1));
    let can_add = add.is_some_and(|path| {
        path.old - diagonal >= 0 && path.old - diagonal < new.len() as isize
    });
    let can_remove = remove
        .as_ref()
        .is_some_and(|path| path.old + 1 < old.len() as isize);
    if !can_add && !can_remove {
        paths.remove(&diagonal);
        return Ok(None);
    }
    let mut path = choose(remove, add, can_remove, can_add);
    *work += path.runs.len() + 1;
    if *work > 2_000_000 {
        return Err(invalid("history diff work limit"));
    }
    common(&mut path, old, new, diagonal);
    if terminal(&path, diagonal, old.len(), new.len()) {
        return Ok(Some(path.runs));
    }
    paths.insert(diagonal, path);
    Ok(None)
}
fn choose(remove: Option<Path>, add: Option<&Path>, can_remove: bool, can_add: bool) -> Path {
    match (remove.filter(|_| can_remove), add.filter(|_| can_add)) {
        (Some(rem), Some(added)) if rem.old < added.old => {
            let mut path = added.clone();
            push(&mut path, 1, 1);
            path
        }
        (Some(mut rem), _) => {
            rem.old += 1;
            push(&mut rem, 2, 1);
            rem
        }
        (None, Some(added)) => {
            let mut path = added.clone();
            push(&mut path, 1, 1);
            path
        }
        (None, None) => Path { old: 0, runs: Vec::new() },
    }
}
fn terminal(path: &Path, diagonal: isize, old: usize, new: usize) -> bool {
    path.old + 1 >= old as isize && path.old - diagonal + 1 >= new as isize
}
fn push(path: &mut Path, kind: u8, count: usize) {
    if count == 0 {
        return;
    }
    if let Some(last) = path.runs
        .last_mut()
        .filter(|run| run.kind == kind)
    {
        last.count += count;
    } else {
        path.runs.push(Run { kind, count });
    }
}
fn common(path: &mut Path, old: &[&str], new: &[&str], diagonal: isize) {
    let mut current = path.old - diagonal;
    let mut count = 0;
    while path.old + 1 < old.len() as isize
        && current + 1 < new.len() as isize
        && old[(path.old + 1) as usize] == new[(current + 1) as usize]
    {
        path.old += 1;
        current += 1;
        count += 1;
    }
    push(path, 0, count);
}
fn values(runs: Vec<Run>, old: &[&str], new: &[&str]) -> Vec<Part> {
    let mut left = 0;
    let mut right = 0;
    runs.into_iter()
        .map(|run| {
            let value = if run.kind == 2 {
                let text = old[left..left + run.count].concat();
                left += run.count;
                text
            } else {
                let text = new[right..right + run.count].concat();
                right += run.count;
                if run.kind == 0 {
                    left += run.count;
                }
                text
            };
            Part { kind: run.kind, value }
        })
        .collect()
}
