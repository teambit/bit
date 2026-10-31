//! Published stash metadata files, naming and retained filesystem observations.
pub use save::PreparedSave;
mod observation;
mod save;
#[cfg(test)]
mod tests;

use observation::Observation;
use serde_json::{Value, json};
use std::{fs, io, path::Path};

/// A selected stash remains present until checkout has completed successfully.
pub struct PreparedLoad {
    observation: Observation,
    filename: String,
    data: Value,
}
impl PreparedLoad {
    /// Select an explicit stash ID or the lexically latest published filename.
    pub fn prepare(scope: &Path, id: Option<&str>) -> io::Result<Self> {
        let observation = Observation::read(scope)?;
        let filename = match id.map(str::trim) {
            Some(id) => {
                validate_id(id)?;
                format!("{id}.json")
            }
            None => observation
                .latest()
                .ok_or_else(|| invalid("no stashed components found"))?
                .to_owned(),
        };
        let bytes = observation
            .file(&filename)
            .ok_or_else(|| {
                io::Error::new(io::ErrorKind::NotFound, format!("stash file {filename} not found"))
            })?;
        let data = crate::parse_jsonc(bytes)?;
        Ok(Self { observation, filename, data })
    }
    /// The complete detached-Version and bitmap metadata, without Source bodies.
    #[must_use]
    pub fn data(&self) -> &Value {
        &self.data
    }
    /// The selected published filename, including its JSON extension.
    #[must_use]
    pub fn filename(&self) -> &str {
        &self.filename
    }
    /// Revalidate the selected metadata and the stash filename inventory.
    pub fn validate(&self) -> io::Result<()> {
        self.observation.validate()
    }
    /// Consume a stash only after its checkout operation has succeeded.
    pub fn consume(&self) -> io::Result<()> {
        self.validate()?;
        fs::remove_file(self.observation.directory().join(&self.filename))
    }
}
/// Project the published list result in stash filename discovery order.
pub fn list(scope: &Path) -> io::Result<Vec<Value>> {
    let observation = Observation::read(scope)?;
    let result = observation
        .files()
        .iter()
        .map(|(name, bytes)| {
            let data = crate::parse_jsonc(bytes)?;
            let components = data["stashCompsData"]
                .as_array()
                .ok_or_else(|| invalid("stash component entries"))?
                .iter()
                .map(|row| component_id(&row["id"]))
                .collect::<io::Result<Vec<_>>>()?;
            let mut row = json!({
                "id": name.strip_suffix(".json").unwrap_or(name),
                "components": components,
            });
            if let Some(message) = data["metadata"].get("message") {
                row["message"] = message.clone();
            }
            Ok(row)
        })
        .collect::<io::Result<Vec<_>>>()?;
    observation.validate()?;
    Ok(result)
}
fn component_id(id: &Value) -> io::Result<String> {
    if let Some(raw) = id
        .as_str()
        .map(str::trim)
        .filter(|raw| !raw.is_empty())
    {
        return Ok(raw.to_owned());
    }
    let name = id["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| invalid("stash component identity"))?;
    let name = id["scope"]
        .as_str()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .map_or_else(|| name.to_owned(), |scope| format!("{scope}/{name}"));
    Ok(id["version"]
        .as_str()
        .map(str::trim)
        .filter(|version| !version.is_empty())
        .map_or_else(|| name.clone(), |version| format!("{name}@{version}")))
}
fn validate_id(id: &str) -> io::Result<()> {
    if id.is_empty() || id.contains(['/', '\\', '\0']) || matches!(id, "." | "..") {
        return Err(invalid("invalid stash ID"));
    }
    Ok(())
}
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}
