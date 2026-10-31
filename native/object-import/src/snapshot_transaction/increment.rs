use serde_json::{Value, json};
use std::io;

use super::invalid;

pub(super) fn increment(
    version: &Value,
    release: &str,
    identifier: Option<&str>,
) -> io::Result<Value> {
    let release = release.trim();
    let identifier = identifier.map(str::trim);
    let mut next = version.clone();
    match release {
        "major" | "minor" | "patch" => stable(&mut next, release)?,
        "premajor" | "preminor" | "prepatch" => {
            next["prerelease"] = json!([]);
            stable(&mut next, &release[3..])?;
            pre(&mut next, identifier)?;
        }
        "prerelease" => {
            if array(&next)?.is_empty() {
                stable(&mut next, "patch")?;
            }
            pre(&mut next, identifier)?;
        }
        _ => return Err(invalid("unsupported semver increment")),
    }
    Ok(next)
}
fn stable(version: &mut Value, release: &str) -> io::Result<()> {
    let prerelease = !array(version)?.is_empty();
    let minor = number(version, "minor")?;
    let patch = number(version, "patch")?;
    let should_increment = match release {
        "major" => minor != 0 || patch != 0 || !prerelease,
        "minor" => patch != 0 || !prerelease,
        _ => !prerelease,
    };
    if should_increment {
        bump(version, release)?;
    }
    if release == "major" {
        version["minor"] = json!(0);
    }
    if release != "patch" {
        version["patch"] = json!(0);
    }
    version["prerelease"] = json!([]);
    Ok(())
}
fn pre(version: &mut Value, identifier: Option<&str>) -> io::Result<()> {
    let mut values = increment_parts(array(version)?)?;
    select_identifier(&mut values, identifier)?;
    version["prerelease"] = json!(parsed_parts(values));
    Ok(())
}
fn increment_parts(parts: &[Value]) -> io::Result<Vec<Value>> {
    let mut values = parts.to_vec();
    let numeric = values.iter().rposition(Value::is_number);
    if let Some(index) = numeric {
        let number = values[index].as_u64().ok_or_else(|| invalid("semver prerelease number"))?;
        values[index] =
            json!(number.checked_add(1).ok_or_else(|| invalid("semver prerelease overflow"))?);
    } else {
        values.push(json!(0));
    }
    Ok(values)
}
fn select_identifier(values: &mut Vec<Value>, identifier: Option<&str>) -> io::Result<()> {
    if let Some(identifier) = identifier.filter(|value| !value.is_empty()) {
        identifier_valid(identifier)?;
        if values
            .first()
            .and_then(|value| part_text(value).ok())
            .as_deref()
            != Some(identifier)
            || !values.get(1).is_some_and(numeric_coercible)
        {
            *values = vec![json!(identifier), json!(0)];
        }
    }
    Ok(())
}
fn parsed_parts(values: Vec<Value>) -> Vec<Value> {
    let mut parsed = Vec::new();
    for value in values {
        if let Some(text) = value.as_str() {
            parsed.extend(text.split('.').map(parsed_part));
        } else if let Some(number) = value
            .as_u64()
            .filter(|number| *number >= 9_007_199_254_740_991)
        {
            parsed.push(json!(number.to_string()));
        } else {
            parsed.push(value);
        }
    }
    parsed
}

fn numeric_coercible(value: &Value) -> bool {
    value.is_number()
        || value
            .as_str()
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .is_some_and(|text| text.parse::<f64>().is_ok())
}
fn identifier_valid(identifier: &str) -> io::Result<()> {
    if identifier.len() > 256
        || identifier
            .split('.')
            .any(|part| {
                part.is_empty()
                    || !part
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
                    || (part.len() > 1
                        && part.starts_with('0')
                        && part.bytes().all(|byte| byte.is_ascii_digit()))
            })
    {
        return Err(invalid("semver prerelease identifier"));
    }
    Ok(())
}
fn bump(version: &mut Value, field: &str) -> io::Result<()> {
    let number = number(version, field)?
        .checked_add(1)
        .filter(|number| *number <= 9_007_199_254_740_991)
        .ok_or_else(|| invalid("semver increment overflow"))?;
    version[field] = json!(number);
    Ok(())
}
fn number(version: &Value, field: &str) -> io::Result<u64> {
    version[field].as_u64().ok_or_else(|| invalid("semver number"))
}
fn array(version: &Value) -> io::Result<&[Value]> {
    version["prerelease"]
        .as_array()
        .map(Vec::as_slice)
        .ok_or_else(|| invalid("semver prerelease"))
}
pub(super) fn format(version: &Value) -> io::Result<String> {
    let mut output = format!(
        "{}.{}.{}",
        number(version, "major")?,
        number(version, "minor")?,
        number(version, "patch")?,
    );
    let prerelease = array(version)?;
    if !prerelease.is_empty() {
        output.push('-');
        for (index, value) in prerelease.iter().enumerate() {
            if index != 0 {
                output.push('.');
            }
            output.push_str(&part_text(value)?);
        }
    }
    Ok(output)
}

fn part_text(value: &Value) -> io::Result<String> {
    if let Some(text) = value.as_str() {
        return Ok(text.trim().to_owned());
    }
    value
        .as_u64()
        .map(|number| number.to_string())
        .ok_or_else(|| invalid("semver prerelease"))
}

fn parsed_part(part: &str) -> Value {
    part.parse::<u64>()
        .ok()
        .filter(|number| *number < 9_007_199_254_740_991)
        .map_or_else(|| json!(part), |number| json!(number))
}
