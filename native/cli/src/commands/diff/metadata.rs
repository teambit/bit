//! `fieldsDiff` of `bit diff`: `rustDiffMetadata` of the Node.js glue and
//! `diffMetadata` of `@teambit/legacy.component-diff` with
//! `formatDepsAsTable: false`.

pub use side::{Component, Side};

mod dependencies;
mod side;

use super::{super::color::Chalk, files};
use crate::commands::status::js::{decline, text, truthy};
use serde_json::{Value, json};
use side::PACKAGE_FIELDS;
use std::io;

const ID_FIELDS: [&str; 4] =
    ["dependencies", "devDependencies", "peerDependencies", "extensionDependencies"];

/// `diffMetadata(left, right)`: `None` when nothing differs.
pub fn diff(left: &Side, right: &Side, chalk: Chalk) -> io::Result<Option<Vec<Value>>> {
    if left.version.is_empty() || right.version.is_empty() {
        return Err(decline("diffBetweenComponentsObjects component does not have a version"));
    }
    let labels = Labels::new(&left.version, &right.version);
    let mut all = fields(left, right, &labels, chalk)?;
    all.extend(extension_configs(left, right, &labels, chalk)?);
    all.extend(dependency_fields(left, right, &labels, chalk)?);
    Ok((!all.is_empty()).then_some(all))
}

/// `getAllDepsOutput`: package dependencies, then component dependencies.
fn dependency_fields(
    left: &Side,
    right: &Side,
    labels: &Labels,
    chalk: Chalk,
) -> io::Result<Vec<Value>> {
    let mut output = Vec::new();
    for (index, field) in PACKAGE_FIELDS.iter().enumerate() {
        let (ours, theirs) = (&left.packages[index], &right.packages[index]);
        let diff = dependencies::package_dependencies(ours, theirs, field, labels, chalk)?;
        output.extend(diff.map(|diff| json!({ "fieldName": field, "diffOutput": diff })));
    }
    for (index, field) in ID_FIELDS.iter().enumerate() {
        let (ours, theirs) = if index == 2 {
            (&left.peers, &right.peers)
        } else {
            (&left.ids[index], &right.ids[index])
        };
        let diff = dependencies::component_dependencies(ours, theirs, field, labels, chalk)?;
        output.extend(diff.map(|diff| json!({ "fieldName": field, "diffOutput": diff })));
    }
    Ok(output)
}

struct Labels {
    left: String,
    right: String,
}

impl Labels {
    /// `labelLeft`/`labelRight`: `<version> original`/`modified` when the versions are the same.
    fn new(left: &str, right: &str) -> Self {
        if left == right {
            Self { left: format!("{left} original"), right: format!("{right} modified") }
        } else {
            Self { left: left.to_string(), right: right.to_string() }
        }
    }
}

/// The printable fields that differ: `object-diff` over the right side's keys.
fn fields(left: &Side, right: &Side, labels: &Labels, chalk: Chalk) -> io::Result<Vec<Value>> {
    let mut output = Vec::new();
    for (field, value) in &right.printable {
        let previous = left.printable.get(field).unwrap_or(&Value::Null);
        if same_field(value, previous) {
            continue;
        }
        let title = prettify(field);
        let header = format!(
            "--- {title} ({})\n{}",
            labels.left,
            chalk.bold(&format!("+++ {title} ({})\n", labels.right)),
        );
        let line = |sign: &str, value: &Value| -> io::Result<String> {
            Ok(if truthy(Some(value)) {
                format!("{sign} {}\n", print_value(value)?)
            } else {
                String::new()
            })
        };
        let body =
            format!("{}{}", chalk.red(&line("-", previous)?), chalk.green(&line("+", value)?));
        output.push(json!({ "fieldName": field, "diffOutput": format!("{header}{body}") }));
    }
    Ok(output)
}

/// `comparator(a, b)`: arrays by membership (`array-difference`), the rest strictly.
fn same_field(left: &Value, right: &Value) -> bool {
    match (left, right) {
        (Value::Array(ours), Value::Array(theirs)) => {
            ours.iter()
                .all(|item| theirs.contains(item))
                && theirs
                    .iter()
                    .all(|item| ours.contains(item))
        }
        (Value::Array(_), _) | (_, Value::Array(_)) => false,
        _ => left == right,
    }
}

/// `printFieldValue`.
fn print_value(value: &Value) -> io::Result<String> {
    match value {
        Value::String(text) => Ok(text.clone()),
        Value::Array(items) => {
            let items = items
                .iter()
                .map(|item| text(Some(item)))
                .collect::<io::Result<Vec<_>>>()?;
            Ok(format!("[ {} ]", items.join(", ")))
        }
        _ => Err(decline("diffBetweenComponentsObjects: unsupported field value")),
    }
}

/// `prettifyFieldName`: `mainFile` becomes `Main File`.
fn prettify(field: &str) -> String {
    let mut chars = field.chars();
    let first: String = chars
        .next()
        .map(|character| character.to_uppercase().collect())
        .unwrap_or_default();
    let spaced: String = format!("{first}{}", chars.as_str())
        .chars()
        .flat_map(|character| {
            if character.is_ascii_uppercase() { vec![' ', character] } else { vec![character] }
        })
        .collect();
    spaced.trim().to_string()
}

/// `getExtensionsConfigOutput`: a git diff of each changed configuration.
fn extension_configs(
    left: &Side,
    right: &Side,
    labels: &Labels,
    chalk: Chalk,
) -> io::Result<Vec<Value>> {
    let mut names: Vec<&String> = left.configs.keys().collect();
    names.extend(
        right.configs
            .keys()
            .filter(|name| !left.configs.contains_key(*name)),
    );
    let mut output = Vec::new();
    for name in names {
        let (ours, theirs) = (left.configs.get(name), right.configs.get(name));
        if let (Some(ours), Some(theirs)) = (ours, theirs)
            && stringify(ours, false)? == stringify(theirs, false)?
        {
            continue;
        }
        let field = format!("{name} configuration");
        let as_text = |config: Option<&Value>| {
            config.map_or(Ok(String::new()), |config| stringify(config, true))
        };
        let raw = files::diff_texts(&as_text(ours)?, &as_text(theirs)?)?;
        let diff = files::format(&raw, &labels.left, &chalk.bold(&labels.right), &field);
        output.push(json!({ "fieldName": field, "diffOutput": diff }));
    }
    Ok(output)
}

/// `JSON.stringify(value)` or `JSON.stringify(value, undefined, 2)` for
/// configurations: floats, whose text JavaScript writes differently, decline.
fn stringify(value: &Value, pretty: bool) -> io::Result<String> {
    if has_float(value) {
        return Err(decline("configuration with a non-integer number"));
    }
    if pretty { serde_json::to_string_pretty(value) } else { serde_json::to_string(value) }.map_err(
        io::Error::other,
    )
}

fn has_float(value: &Value) -> bool {
    match value {
        Value::Number(number) => !number.is_i64() && !number.is_u64(),
        Value::Array(items) => items.iter().any(has_float),
        Value::Object(map) => map.values().any(has_float),
        _ => false,
    }
}

#[cfg(test)]
mod metadata_tests;
