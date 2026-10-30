//! `teambit.workspace/variants` matching (`@teambit/workspace.modules.match-pattern`
//! and `VariantsMain.byRootDirAndName`).

pub use glob::matches as matches_namespace;

mod glob;

use serde_json::{Map, Value};
use std::io;

/// Keys of a variant that are not aspects.
const INTERNAL_FIELDS: [&str; 3] = ["propagate", "exclude", "defaultScope"];

#[derive(Debug, Clone, Copy, PartialEq)]
struct ItemMatch {
    matched: bool,
    specificity: f64,
    excluded: bool,
}

#[derive(Debug, Clone, Copy)]
struct MatchedVariant<'a> {
    pattern: &'a str,
    specificity: f64,
    config: &'a Map<String, Value>,
}

const NO_MATCH: ItemMatch = ItemMatch { matched: false, specificity: -1.0, excluded: false };

/// The variants matching a component, merged.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct VariantConfig {
    /// Aspect configs of the matches, most specific first, until one stops propagation.
    pub extensions: Vec<Map<String, Value>>,
    pub propagate: bool,
    pub default_scope: Option<String>,
    pub max_specificity: f64,
    pub matched_rules: Vec<(String, f64)>,
}

/// `byRootDirAndName`: every pattern matching the component's root dir or
/// name, sorted by specificity (ties: the later pattern first).
pub fn by_root_dir_and_name(
    variants: &[(String, Map<String, Value>)],
    root_dir: &str,
    name: &str,
) -> io::Result<VariantConfig> {
    Ok(merge_matches(sorted_matches(variants, root_dir, name)?))
}

/// The matching variants by specificity, descending; lodash
/// `sortBy(...).reverse()` puts the later of two equal patterns first.
fn sorted_matches<'a>(
    variants: &'a [(String, Map<String, Value>)],
    root_dir: &str,
    name: &str,
) -> io::Result<Vec<MatchedVariant<'a>>> {
    let mut matches = Vec::new();
    for (pattern, config) in variants {
        let found = is_match_pattern(root_dir, name, pattern)?;
        if found.matched && !found.excluded {
            matches.push(MatchedVariant {
                pattern: pattern.as_str(),
                specificity: found.specificity,
                config,
            });
        }
    }
    matches.sort_by(|left, right| left.specificity.total_cmp(&right.specificity));
    matches.reverse();
    Ok(matches)
}

/// Aspects of the matches until one stops propagation; the first default scope.
fn merge_matches(matches: Vec<MatchedVariant<'_>>) -> VariantConfig {
    let mut result =
        VariantConfig { propagate: true, max_specificity: -1.0, ..VariantConfig::default() };
    result.max_specificity = matches.first().map_or(-1.0, |item| item.specificity);
    result.matched_rules = matches
        .iter()
        .map(|item| (item.pattern.to_owned(), item.specificity))
        .collect();
    for item in matches {
        if result.default_scope.is_none() {
            result.default_scope = item.config
                .get("defaultScope")
                .and_then(Value::as_str)
                .map(str::to_owned);
        }
        if result.propagate {
            let aspects = item.config
                .iter()
                .filter(|(key, _)| !INTERNAL_FIELDS.contains(&key.as_str()));
            result.extensions.push(
                aspects
                    .map(|(key, value)| (key.clone(), value.clone()))
                    .collect(),
            );
        }
        if item.config.get("propagate") == Some(&Value::Bool(false)) {
            result.propagate = false;
        }
    }
    result
}

/// `isMatchPattern`: comma-separated items; the most specific decides the
/// match, any matching `!` item excludes.
fn is_match_pattern(root_dir: &str, name: &str, pattern: &str) -> io::Result<ItemMatch> {
    let items = pattern
        .split(',')
        .map(|item| is_match_item(root_dir, name, item))
        .collect::<io::Result<Vec<_>>>()?;
    // lodash `maxBy` keeps the first maximum.
    let best = items
        .iter()
        .fold(None::<ItemMatch>, |best, item| match best {
            Some(best) if best.specificity >= item.specificity => Some(best),
            _ => Some(*item),
        });
    let excluded = items
        .iter()
        .any(|item| item.matched && item.excluded);
    let best = best.unwrap_or(NO_MATCH);
    Ok(ItemMatch { matched: best.matched, specificity: best.specificity, excluded })
}

fn is_match_item(root_dir: &str, name: &str, item: &str) -> io::Result<ItemMatch> {
    let item = item.trim();
    if item == "*" {
        return Ok(ItemMatch { matched: true, specificity: 0.0, excluded: false });
    }
    let (excluded, item) = item
        .strip_prefix('!')
        .map_or((false, item), |rest| (true, rest));
    let found = if item.starts_with('{') {
        namespace_match(name, item)
    } else {
        if item.contains('*') {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!(
                    r#"variant "{item}" is not valid. glob patterns are not supported for file paths. by default variants are applied to all sub-directories"#,
                ),
            ));
        }
        dir_match(root_dir, item)
    };
    Ok(ItemMatch { excluded, ..found })
}

/// `isMatchDirPatternItem`: the root dir is the pattern dir or inside it.
fn dir_match(root_dir: &str, item: &str) -> ItemMatch {
    let pattern = item.trim_end_matches('/').trim();
    let root_dir = root_dir.trim_end_matches('/');
    let inside = root_dir
        .strip_prefix(pattern)
        .is_some_and(|rest| rest.is_empty() || rest.starts_with('/'));
    if !inside {
        return NO_MATCH;
    }
    ItemMatch { matched: true, specificity: pattern.split('/').count() as f64, excluded: false }
}

/// `isMatchNamespacePatternItem`: `{ui/*}` against the component name.
fn namespace_match(name: &str, item: &str) -> ItemMatch {
    let without_brackets = item.replacen('{', "", 1).replacen('}', "", 1);
    let pattern = without_brackets
        .trim()
        .trim_end_matches('/')
        .trim();
    if !glob::matches(pattern, name) {
        return NO_MATCH;
    }
    let specificity = pattern
        .split('/')
        .enumerate()
        .fold(0.0, |total, (index, element)| match element {
            "**" => total + index as f64 / 20.0,
            "*" => total + index as f64 / 10.0,
            _ => total + 1.0,
        });
    ItemMatch { matched: true, specificity, excluded: false }
}
