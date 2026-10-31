use serde_json::Value;
use std::io;

use crate::transfer::{MAX_OBJECTS, invalid};

/// The entries one Version array may hold. A large app's `flattenedDependencies`
/// lists thousands of components.
const MAX_VERSION_ARRAY: usize = 65_536;

pub(super) fn eligible(value: &Value) -> io::Result<Value> {
    prepare(value, true)
}

pub(crate) fn history(value: &Value) -> io::Result<()> {
    prepare(value, false).map(|_| ())
}

pub(crate) fn query(value: &Value) -> io::Result<()> {
    prepare(value, true).map(|_| ())
}

fn prepare(value: &Value, artifacts: bool) -> io::Result<Value> {
    let mut clean = value.clone();
    dependencies(value, &mut clean)?;
    flattened(value, &mut clean)?;
    if let Some(parents) = array(value, "parents")? {
        for parent in parents {
            crate::merge_history::hash(
                parent.as_str().ok_or_else(|| invalid("unsupported Version parent"))?,
            )?;
        }
    }
    edges(value, &mut clean)?;
    extensions(value, &mut clean, artifacts)?;
    crate::merge_history::metadata::validate(&clean)?;
    Ok(clean)
}

fn dependencies(value: &Value, clean: &mut Value) -> io::Result<()> {
    for field in ["dependencies", "devDependencies"] {
        if let Some(items) = array(value, field)? {
            for item in items {
                identity(item.get("id"))?;
                relatives(item.get("relativePaths"))?;
            }
            clean[field] = Value::Array(Vec::new());
        }
    }
    Ok(())
}
fn flattened(value: &Value, clean: &mut Value) -> io::Result<()> {
    for field in ["flattenedDependencies", "flattenedDevDependencies"] {
        let Some(items) = array(value, field)? else { continue };
        for item in items {
            match item {
                Value::String(text) => string_id(text)?,
                _ => identity(Some(item))?,
            }
        }
        clean[field] = Value::Array(Vec::new());
    }
    Ok(())
}

fn array<'a>(value: &'a Value, field: &str) -> io::Result<Option<&'a Vec<Value>>> {
    let Some(value) = value.get(field) else { return Ok(None) };
    let items = value.as_array().ok_or_else(|| invalid("unsupported Version array"))?;
    if items.len() > MAX_VERSION_ARRAY {
        return Err(invalid("Version array limit"));
    }
    Ok(Some(items))
}

fn identity(value: Option<&Value>) -> io::Result<()> {
    let value = value
        .and_then(Value::as_object)
        .ok_or_else(|| invalid("unsupported component identity"))?;
    let scope = value
        .get("scope")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("missing component scope"))?;
    let name = value
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("missing component name"))?;
    if !segment(scope, false)
        || !segment(name, true)
        || value
            .get("version")
            .is_some_and(|value| !value.is_string())
    {
        return Err(invalid("unsupported component identity"));
    }
    Ok(())
}

fn segment(text: &str, slash: bool) -> bool {
    !text.is_empty()
        && text.len() <= 4096
        && text
            .split('/')
            .all(|part| !part.is_empty())
        && text
            .bytes()
            .all(|byte| {
                byte.is_ascii_lowercase()
                    || byte.is_ascii_digit()
                    || b"._-".contains(&byte)
                    || slash && byte == b'/'
            })
}

fn string_id(text: &str) -> io::Result<()> {
    let id = text.split('@').next().unwrap_or("");
    let (scope, name) =
        id.split_once('/').ok_or_else(|| invalid("unsupported flattened identity"))?;
    if !segment(scope, false) || !segment(name, true) || text.len() > 8192 {
        return Err(invalid("unsupported flattened identity"));
    }
    Ok(())
}

fn relatives(value: Option<&Value>) -> io::Result<()> {
    let Some(Value::Array(items)) = value else { return Ok(()) };
    if items.len() > MAX_OBJECTS {
        return Err(invalid("relative path count limit"));
    }
    for item in items {
        if !item.is_object() {
            return Err(invalid("unsupported dependency relative path"));
        }
        specifiers(item)?;
    }
    Ok(())
}

fn specifiers(value: &Value) -> io::Result<()> {
    let Some(value) = value
        .get("importSpecifiers")
        .filter(|value| !value.is_null() && value != &&Value::Bool(false))
    else {
        return Ok(());
    };
    let items = value.as_array().ok_or_else(|| invalid("unsupported import specifiers"))?;
    if items.len() > MAX_OBJECTS
        || items
            .iter()
            .any(|item| !item.is_object())
    {
        return Err(invalid("unsupported import specifiers"));
    }
    Ok(())
}

fn extensions(value: &Value, clean: &mut Value, artifacts: bool) -> io::Result<()> {
    let Some(items) = array(value, "extensions")? else { return Ok(()) };
    for (index, item) in items.iter().enumerate() {
        if let Some(id) = item
            .get("extensionId")
            .filter(|value| !value.is_null())
        {
            identity(Some(id))?;
            clean["extensions"][index]
                .as_object_mut()
                .ok_or_else(|| invalid("invalid extension"))?
                .remove("extensionId");
        }
        if artifacts
            && crate::workspace::engine::client_status::config::is_extension_aspect(
                item,
                "teambit.pipelines/builder",
            )
            && let Some(data) =
                clean["extensions"][index].get_mut("data").and_then(Value::as_object_mut)
        {
            data.insert("artifacts".to_owned(), Value::Array(Vec::new()));
        }
    }
    Ok(())
}

fn edges(value: &Value, clean: &mut Value) -> io::Result<()> {
    if value.get("flattenedEdgesRef").is_some_and(Value::is_string) {
        return Ok(());
    }
    let Some(items) = array(value, "flattenedEdges")? else { return Ok(()) };
    for item in items {
        identity(item.get("source"))?;
        identity(item.get("target"))?;
    }
    clean["flattenedEdges"] = Value::Array(Vec::new());
    Ok(())
}
