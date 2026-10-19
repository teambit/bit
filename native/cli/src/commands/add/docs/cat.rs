//! Cold `cat` documentation uses the published parser without starting Harmony.
use super::{cache_hits, observe, order, validate};
use crate::commands::status::cache;
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    io,
    path::{Path, PathBuf},
};

pub(in crate::commands) struct CatDocs {
    root: PathBuf,
    components: Vec<Value>,
    observed: BTreeMap<PathBuf, super::Source>,
    directory: PathBuf,
    plan: cache_hits::Plan,
    writes: Vec<Value>,
}

/// Cache corruption and ambiguous feature precedence must reach the published
/// consumer, whose `FsCache` owns its cleanup and option semantics.
pub(in crate::commands) fn cat_prepare(root: &Path, component: Value) -> Option<CatDocs> {
    if cache::no_fs_cache(root) {
        return None;
    }
    let components = vec![component];
    let observed = observe(root, &components).ok()?;
    let directory = bit_object_import::scope_path(root).join("cache/components/docs");
    let plan = cache_hits::inspect(root, &directory, &components, &observed).ok()?;
    validate(&plan.proven, &observed).ok()?;
    let writes = plan.proven.clone();
    Some(CatDocs { root: root.to_owned(), components, observed, directory, plan, writes })
}

impl CatDocs {
    pub(in crate::commands) fn misses(&self) -> &[Value] {
        &self.plan.misses
    }

    pub(in crate::commands) fn absorb(&mut self, receipt: &Value) -> io::Result<Option<String>> {
        let (parsed, error, failed_at) = receipt_rows(receipt)?;
        if error.is_some() && failed_at.is_none() && parsed.is_empty() {
            return Ok(error.map(str::to_owned));
        }
        if error.is_some() != failed_at.is_some() {
            return Err(io::Error::other("cat documentation failure receipt"));
        }
        self.validate_receipt_rows(parsed, failed_at)?;
        if let Some(failed_at) = failed_at {
            self.publish_prefix(failed_at, parsed)?;
            return Ok(error.map(str::to_owned));
        }
        let mut writes = self.plan.proven.clone();
        writes.extend(parsed.iter().cloned());
        order(&self.root, &self.components, &mut writes)?;
        validate(&writes, &self.observed)?;
        if self.observed != observe(&self.root, &self.components)? {
            return Err(io::Error::other("cat documentation sources changed"));
        }
        self.writes = writes;
        Ok(None)
    }

    pub(in crate::commands) fn publish(self) -> io::Result<()> {
        if self.observed != observe(&self.root, &self.components)? {
            return Err(io::Error::other("cat documentation sources changed"));
        }
        let current =
            cache_hits::inspect(&self.root, &self.directory, &self.components, &self.observed)?;
        if current.hits != self.plan.hits
            || current.misses != self.plan.misses
            || current.proven != self.plan.proven
        {
            return Err(io::Error::other("cat documentation cache changed"));
        }
        self.publish_rows(&self.writes)
    }

    fn miss_paths(&self) -> io::Result<Vec<PathBuf>> {
        let mut paths = Vec::new();
        for component in &self.plan.misses {
            for file in component["files"]
                .as_array()
                .ok_or_else(|| io::Error::other("cat documentation files"))?
            {
                paths.push(cache_hits::source_path(&self.root, component, file)?);
            }
        }
        Ok(paths)
    }

    fn validate_receipt_rows(&self, parsed: &[Value], failed_at: Option<&str>) -> io::Result<()> {
        let expected = self.miss_paths()?;
        let completed = if let Some(path) = failed_at {
            expected
                .iter()
                .position(|expected| expected.to_str() == Some(path))
                .ok_or_else(|| io::Error::other("cat documentation failure path"))?
        } else {
            expected.len()
        };
        if completed != parsed.len()
            || expected
                .iter()
                .take(completed)
                .zip(parsed)
                .any(|(path, row)| {
                    row["path"].as_str() != path.to_str() || row.get("docs").is_none()
                })
        {
            return Err(io::Error::other("cat documentation parser receipt order"));
        }
        Ok(())
    }

    fn publish_prefix(&self, failed_at: &str, parsed: &[Value]) -> io::Result<()> {
        let prefix = self.prefix_component(failed_at)?;
        let components = [prefix];
        let observed = observe(&self.root, &components)?;
        if observed
            .iter()
            .any(|(path, source)| self.observed.get(path) != Some(source))
        {
            return Err(io::Error::other("cat documentation completed sources changed"));
        }
        let mut writes = self.prefix_cache_rows(&components, &observed)?;
        writes.extend(parsed.iter().cloned());
        order(&self.root, &components, &mut writes)?;
        self.publish_rows(&writes)
    }

    fn prefix_component(&self, failed_at: &str) -> io::Result<Value> {
        let mut prefix = self.components[0].clone();
        let mut files = Vec::new();
        let mut found = false;
        for file in self.components[0]["files"]
            .as_array()
            .ok_or_else(|| io::Error::other("cat documentation files"))?
        {
            if cache_hits::source_path(&self.root, &self.components[0], file)?
                == Path::new(failed_at)
            {
                found = true;
                break;
            }
            files.push(file.clone());
        }
        if !found {
            return Err(io::Error::other("cat documentation failure outside component"));
        }
        prefix["files"] = json!(files);
        Ok(prefix)
    }

    fn prefix_cache_rows(
        &self,
        components: &[Value],
        observed: &BTreeMap<PathBuf, super::Source>,
    ) -> io::Result<Vec<Value>> {
        let current = cache_hits::inspect(&self.root, &self.directory, components, observed)?;
        let before = |row: &Value| {
            row["path"]
                .as_str()
                .is_some_and(|path| observed.contains_key(Path::new(path)))
        };
        let expected_hits = self.plan.hits
            .iter()
            .filter(|row| before(row))
            .cloned()
            .collect::<Vec<_>>();
        let expected_proven = self.plan.proven
            .iter()
            .filter(|row| before(row))
            .cloned()
            .collect::<Vec<_>>();
        if current.hits != expected_hits || current.proven != expected_proven {
            return Err(io::Error::other("cat documentation completed cache changed"));
        }
        Ok(expected_proven)
    }

    fn publish_rows(&self, writes: &[Value]) -> io::Result<()> {
        for (path, bytes) in validate(writes, &self.observed)? {
            // Published FsCache.saveDataInCache treats IO failures as nonfatal.
            let _ = bit_install::dependencies::cache::put(&self.directory, &path, &bytes);
        }
        Ok(())
    }
}

fn receipt_rows(receipt: &Value) -> io::Result<(&[Value], Option<&str>, Option<&str>)> {
    let parsed = receipt["writes"]
        .as_array()
        .ok_or_else(|| io::Error::other("cat documentation receipt"))?;
    let error = receipt["error"].as_str();
    let failed_at = receipt["failedAt"].as_str();
    if !receipt["error"].is_null() && error.is_none() {
        return Err(io::Error::other("cat documentation failure receipt"));
    }
    Ok((parsed, error, failed_at))
}
