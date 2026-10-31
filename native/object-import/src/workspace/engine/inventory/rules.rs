use super::super::invalid;
use rayon::{ThreadPool, prelude::*};
use regress::Regex;
use serde::Deserialize;
use std::{collections::HashMap, io, sync::Arc};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Rule {
    source: String,
    negative: bool,
}
#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Policy {
    rules: Vec<Rule>,
    #[serde(default)]
    cache: Vec<(String, bool)>,
}
pub(super) struct Matcher {
    rules: Arc<[(Regex, bool)]>,
    cache: HashMap<String, bool>,
    pub(super) changes: Vec<(String, bool)>,
}
impl Matcher {
    pub(super) fn new(policy: Policy) -> io::Result<Self> {
        if policy.rules.len() > 4096 || policy.cache.len() > 16384 {
            return Err(invalid("inventory ignore policy limit"));
        }
        let rules = policy.rules
            .into_iter()
            .map(|rule| {
                if !rule.source.is_ascii()
                    || rule.source.contains(r"\u")
                    || rule.source.contains(r"\x")
                {
                    return Err(invalid("inventory requires ASCII ignore expressions"));
                }
                if rule.source.is_empty() || rule.source.len() > 32768 {
                    return Err(invalid("inventory ignore expression limit"));
                }
                let regex = Regex::with_flags(&rule.source, "i").map_err(io::Error::other)?;
                Ok((regex, rule.negative))
            })
            .collect::<io::Result<Vec<_>>>()?;
        Ok(Self {
            rules: rules.into(),
            cache: policy.cache.into_iter().collect(),
            changes: Vec::new(),
        })
    }
    pub(super) fn filter(&mut self, paths: &[String], pool: &ThreadPool) -> Vec<String> {
        if paths.len() < 128 {
            return paths
                .iter()
                .filter(|path| self.keep(path))
                .cloned()
                .collect();
        }
        let batches: Vec<_> = pool.install(|| {
            paths
                .par_chunks(64)
                .map(|chunk| {
                    let mut matcher = Self {
                        rules: Arc::clone(&self.rules),
                        cache: self.cache.clone(),
                        changes: Vec::new(),
                    };
                    let kept: Vec<_> = chunk
                        .iter()
                        .filter(|path| matcher.keep(path))
                        .cloned()
                        .collect();
                    (kept, matcher.changes)
                })
                .collect()
        });
        let mut kept = Vec::new();
        for (files, changes) in batches {
            kept.extend(files);
            for (path, keep) in changes {
                if let std::collections::hash_map::Entry::Vacant(entry) = self
                    .cache
                    .entry(path.clone())
                {
                    entry.insert(keep);
                    self.changes.push((path, keep));
                }
            }
        }
        kept
    }
    pub(super) fn keep(&mut self, path: &str) -> bool {
        if path.is_empty() {
            return false;
        }
        if let Some(keep) = self.cache.get(path) {
            return *keep;
        }
        // node-ignore 3 uses an ordinary object cache and its inherited truthy entries.
        if inherited(path) {
            return true;
        }
        let parent = path
            .trim_end_matches('/')
            .rsplit_once('/')
            .map(|(parent, _)| format!("{parent}/"));
        let keep = parent.is_none_or(|parent| self.keep(&parent)) && self.test(path);
        self.cache.insert(path.to_owned(), keep);
        self.changes.push((path.to_owned(), keep));
        keep
    }
    fn test(&self, path: &str) -> bool {
        let mut ignored = false;
        for (regex, negative) in self.rules.iter() {
            if ignored == *negative {
                ignored = *negative ^ regex.find_ascii(path).is_some();
            }
        }
        !ignored
    }
}
fn inherited(path: &str) -> bool {
    matches!(
        path,
        "constructor"
            | "__defineGetter__"
            | "__defineSetter__"
            | "hasOwnProperty"
            | "__lookupGetter__"
            | "__lookupSetter__"
            | "isPrototypeOf"
            | "propertyIsEnumerable"
            | "toString"
            | "valueOf"
            | "__proto__"
            | "toLocaleString",
    )
}
