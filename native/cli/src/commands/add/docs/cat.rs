//! Cold `cat` documentation uses the published parser without starting Harmony.
use super::{cache_hits, observe, order, validate};
use crate::commands::status::cache;
use serde_json::Value;
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
    host_published: bool,
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
    Some(CatDocs {
        root: root.to_owned(),
        components,
        observed,
        directory,
        plan,
        host_published: false,
    })
}

impl CatDocs {
    pub(in crate::commands) fn misses(&self) -> &[Value] {
        &self.plan.misses
    }

    pub(in crate::commands) fn components(&self) -> &[Value] {
        &self.components
    }

    pub(in crate::commands) fn absorb(&mut self, receipt: &Value) -> io::Result<Option<String>> {
        let error = parse_doc_receipt(receipt)?;
        self.host_published = true;
        Ok(error)
    }

    pub(in crate::commands) fn publish(self) -> io::Result<()> {
        if self.observed != observe(&self.root, &self.components)? {
            return Err(io::Error::other("cat documentation sources changed"));
        }
        if self.host_published {
            // The published FsCache already owns every parser/cache effect. Replaying
            // writes here would change metadata timestamps and failure behavior.
            return Ok(());
        }
        let current =
            cache_hits::inspect(&self.root, &self.directory, &self.components, &self.observed)?;
        if current.hits != self.plan.hits
            || current.misses != self.plan.misses
            || current.proven != self.plan.proven
        {
            return Err(io::Error::other("cat documentation cache changed"));
        }
        let mut writes = self.plan.proven;
        order(&self.root, &self.components, &mut writes)?;
        for (path, bytes) in validate(&writes, &self.observed)? {
            // Published FsCache.saveDataInCache treats IO failures as nonfatal.
            let _ = bit_install::dependencies::cache::put(&self.directory, &path, &bytes);
        }
        Ok(())
    }
}

fn parse_doc_receipt(receipt: &Value) -> io::Result<Option<String>> {
    if receipt["published"] != true && receipt["published"].as_str() != Some("true") {
        return Err(io::Error::other("cat documentation parser receipt"));
    }
    let error = &receipt["error"];
    if error.is_null() {
        return Ok(None);
    }
    if let Some(message) = error
        .as_str()
        .or_else(|| error.get("message").and_then(Value::as_str))
    {
        let trimmed = message.trim();
        return Ok((!trimmed.is_empty()).then(|| trimmed.to_owned()));
    }
    Err(io::Error::other("cat documentation parser receipt"))
}
