//! Persist the published per-component configuration conflict document.
use super::{Prepared, config, invalid};
use serde_json::{Value, json};
use std::{
    io,
    path::{Path, PathBuf},
};

pub(super) struct File {
    path: PathBuf,
    text: String,
}

impl File {
    pub(super) fn validate(&self) -> io::Result<()> {
        if self.path.try_exists()? || self.path.is_symlink() {
            return Err(invalid("command configuration conflict document changed"));
        }
        Ok(())
    }
    pub(super) fn commit(&self) -> io::Result<()> {
        self.validate()?;
        crate::merge_state::write::commit(&self.path, &self.text)
    }
}

pub(super) fn prepare(policy: &mut Prepared, root: &Path) -> io::Result<Vec<Value>> {
    let mut sections = Vec::new();
    let mut results = Vec::new();
    for row in &policy.rows {
        let receipt = &row.receipts.configuration;
        let mut conflicts = Vec::new();
        for aspect in receipt["result"]["configRows"]
            .as_array()
            .into_iter()
            .flatten()
        {
            if aspect.get("conflict").is_some() {
                conflicts.push(aspect_text(&receipt["input"], aspect)?);
            }
        }
        if conflicts.is_empty() {
            continue;
        }
        let divider = "-".repeat(80);
        sections.push(format!(
            "{divider}\n[*] {}\n{divider}\n{{\n{}\n}}",
            row.identity,
            concatenate(conflicts),
        ));
        results.push(json!({"compIdStr":row.identity,"hasConflicts":true}));
    }
    if !sections.is_empty() {
        let file = File {
            path: root.join("merge-conflict"),
            text: format!(
                "# Resolve configuration conflicts per component and make sure the Component ID remain in place\n\n{}",
                sections.join("\n\n"),
            ),
        };
        file.validate()?;
        policy.conflicts = Some(file);
    }
    Ok(results)
}

fn aspect_text(input: &Value, row: &Value) -> io::Result<String> {
    let id = row["id"].as_str().ok_or_else(|| invalid("command config conflict identity"))?;
    let body = if row["conflict"]["kind"] == "deps" {
        dependency(input, id, &row["conflict"]["value"])?
    } else {
        basic(input, id, &row["conflict"])?
    };
    Ok(body
        .lines()
        .map(|line| {
            if line.starts_with("<<<<<<<")
                || line.starts_with("=======")
                || line.starts_with(">>>>>>>")
            {
                line.to_owned()
            } else {
                format!("  {line}")
            }
        })
        .collect::<Vec<_>>()
        .join("\n"))
}

fn dependency(input: &Value, id: &str, conflict: &Value) -> io::Result<String> {
    let text = serde_json::to_string_pretty(&json!({"policy":conflict})).map_err(io::Error::other)?;
    let mut lines = text.lines().skip(1).map(|line| {
        if !line.contains("CONFLICT::") { return Ok(line.to_owned()); }
        let parts = line.split("::").collect::<Vec<_>>();
        let current = parts.get(1).ok_or_else(|| invalid("command conflict current version"))?;
        let other = parts.get(2).ok_or_else(|| invalid("command conflict incoming version"))?;
        Ok(format!("<<<<<<< {}\n        \"version\": \"{current}\",\n=======\n        \"version\": \"{other}\",\n>>>>>>> {}", label(input,"currentLabel")?,label(input,"otherLabel")?))
    }).collect::<io::Result<Vec<_>>>()?;
    lines.insert(0, format!(r#""{id}": {{"#));
    Ok(lines.join("\n"))
}

fn basic(input: &Value, id: &str, conflict: &Value) -> io::Result<String> {
    let current = config::resolve(input, &conflict["current"])?;
    let other = config::resolve(input, &conflict["other"])?;
    let current_text = serde_json::to_string_pretty(&current).map_err(io::Error::other)?;
    let other_text = serde_json::to_string_pretty(&other).map_err(io::Error::other)?;
    let markers = (label(input, "currentLabel")?, label(input, "otherLabel")?);
    if current == "-" || other == "-" {
        return Ok(format!(
            "<<<<<<< {}\n\"{id}\": {current_text}\n=======\n\"{id}\": {other_text}\n>>>>>>> {}",
            markers.0, markers.1,
        ));
    }
    let inner = |text: &str| {
        text.lines()
            .skip(1)
            .take(text.lines().count().saturating_sub(2))
            .collect::<Vec<_>>()
            .join("\n")
    };
    Ok(format!(
        "\"{id}\": {{\n<<<<<<< {}\n{}\n=======\n{}\n>>>>>>> {}\n}}",
        markers.0,
        inner(&current_text),
        inner(&other_text),
        markers.1,
    ))
}

fn label<'a>(input: &'a Value, field: &str) -> io::Result<&'a str> {
    input[field].as_str().ok_or_else(|| invalid("command config conflict label"))
}

fn concatenate(mut conflicts: Vec<String>) -> String {
    let count = conflicts.len();
    for conflict in conflicts
        .iter_mut()
        .take(count.saturating_sub(1))
    {
        if conflict.ends_with('}') {
            conflict.push(',');
        } else if let Some(index) = conflict.rfind("\n  }") {
            conflict.insert(index + 4, ',');
        }
    }
    conflicts.join("\n")
}
