//! `Scope.getRemoteComponent` fetches immutable objects without publishing a local scope import.
mod objects;
#[cfg(test)]
mod tests;
use super::{required, unsupported};
use crate::component_tracking::observe::Observed;
use bit_client_transfer::{
    fetch::FetchOptions,
    http::Network,
    remotes::{Remote, Remotes},
};
use serde_json::Value;
use std::io;

pub struct RemoteCapture {
    sources: Vec<Value>,
    objects: Vec<Value>,
    directories: Vec<tempfile::TempDir>,
    observed: Observed,
}
impl RemoteCapture {
    pub fn fetch(ids: &[String], remotes: &Remotes, network: &Network) -> io::Result<Self> {
        if ids.len() > 4096 {
            return Err(unsupported("fork remote component budget"));
        }
        let mut capture = Self::empty();
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()?
            .block_on(async {
                for id in ids {
                    let scope = id
                        .trim()
                        .split_once('/')
                        .map(|(scope, _)| scope.trim())
                        .filter(|scope| !scope.is_empty())
                        .ok_or_else(|| unsupported("fork remote scoped identity"))?;
                    let (version, files, identity, objects) =
                        match remotes.resolve(scope, network).await? {
                            Remote::File(path) => objects::file(&path, id, &mut capture.observed)
                                .map_err(|error| single_error(error, id))?,
                            Remote::Http(url) => {
                                let items = network
                                    .fetch_bounded(
                                        &url,
                                        std::slice::from_ref(id),
                                        &FetchOptions::without_dependencies(None),
                                        128 * 1024 * 1024,
                                    )
                                    .await
                                    .map_err(|error| single_error(error, id))?;
                                objects::http(&items, id).map_err(|error| single_error(error, id))?
                            }
                        };
                    capture.push(id, &identity, &version, &files, objects)?;
                }
                capture.observed.validate()
            })?;
        Ok(capture)
    }
    /// Scope forks use one immutable fetch per remote scope, before copying any component.
    pub fn fetch_many(ids: &[String], remotes: &Remotes, network: &Network) -> io::Result<Self> {
        if ids.len() > 4096 {
            return Err(unsupported("fork remote component budget"));
        }
        let mut capture = Self::empty();
        let groups = groups(ids)?;
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()?
            .block_on(async {
                for (scope, ids) in groups {
                    match remotes.resolve(&scope, network).await? {
                        Remote::File(path) => {
                            for id in ids {
                                let (version, files, identity, objects) =
                                    objects::file(&path, &id, &mut capture.observed)?;
                                capture.push(&id, &identity, &version, &files, objects)?;
                            }
                        }
                        Remote::Http(url) => {
                            let items = network.fetch_bounded(
                                &url,
                                &ids,
                                &FetchOptions::without_dependencies(None),
                                128 * 1024 * 1024,
                            )
                            .await?;
                            for id in ids {
                                let (version, files, identity, objects) =
                                    objects::http(&items, &id)?;
                                capture.push(&id, &identity, &version, &files, objects)?;
                            }
                        }
                    }
                }
                capture.validate()
            })?;
        Ok(capture)
    }
    #[must_use]
    pub fn sources(&self) -> &[Value] {
        &self.sources
    }
    #[must_use]
    pub fn objects(&self) -> &[Value] {
        &self.objects
    }
    pub fn validate(&self) -> io::Result<()> {
        self.observed.validate()
    }
    fn empty() -> Self {
        Self {
            sources: Vec::new(),
            objects: Vec::new(),
            directories: Vec::new(),
            observed: Observed::default(),
        }
    }
    fn write_objects(&mut self, objects: Vec<(String, Vec<u8>)>) -> io::Result<()> {
        let object_directory =
            tempfile::Builder::new().prefix("bit-native-fork-objects-").tempdir()?;
        for (hash, bytes) in objects {
            if self.objects
                .iter()
                .any(|row| row["hash"] == hash)
            {
                continue;
            }
            let path = object_directory.path().join(&hash);
            if path.exists() {
                continue;
            }
            std::fs::write(&path, bytes)?;
            required(&mut self.observed, &path)?;
            self.objects.push(serde_json::json!({"hash":hash,"path":path}));
        }
        self.directories.push(object_directory);
        Ok(())
    }
    fn push(
        &mut self,
        id: &str,
        version_id: &str,
        version: &Value,
        files: &[(String, Vec<u8>)],
        objects: Vec<(String, Vec<u8>)>,
    ) -> io::Result<()> {
        let directory = tempfile::Builder::new().prefix("bit-native-fork-").tempdir()?;
        for (relative, bytes) in files {
            let path = directory.path().join(relative);
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&path, bytes)?;
            self.observed.ancestors(
                directory.path(),
                path.parent().ok_or_else(|| unsupported("fork private source parent"))?,
            )?;
            required(&mut self.observed, &path)?;
        }
        self.write_objects(objects)?;
        let configs = objects::configs(version)?;
        let bare_id = id
            .trim()
            .split('@')
            .next()
            .unwrap_or(id)
            .trim();
        self.sources.push(serde_json::json!({"identity":bare_id,"version":version_id,"sourceDirectory":directory.path(),"mainFile":version["mainFile"],"files":files.iter().map(|(path,_)|serde_json::json!({"relativePath":path})).collect::<Vec<_>>(),"versionData":version,"sourceConfigs":configs}));
        self.directories.push(directory);
        Ok(())
    }
}

fn groups(ids: &[String]) -> io::Result<Vec<(String, Vec<String>)>> {
    let mut groups: Vec<(String, Vec<String>)> = Vec::new();
    for id in ids {
        let id_trimmed = id.trim();
        let scope = id_trimmed
            .split_once('/')
            .map(|(scope, _)| scope.trim())
            .filter(|scope| !scope.is_empty())
            .ok_or_else(|| unsupported("fork remote scoped identity"))?;
        if let Some((_, rows)) = groups
            .iter_mut()
            .find(|(name, _)| name == scope)
        {
            rows.push(id_trimmed.to_owned());
        } else {
            groups.push((scope.into(), vec![id_trimmed.to_owned()]));
        }
    }
    Ok(groups)
}

fn single_error(error: io::Error, id: &str) -> io::Error {
    if error.kind() == io::ErrorKind::NotFound
        || error.to_string() == "checkout invalid compressed object"
    {
        return io::Error::new(
            io::ErrorKind::NotFound,
            format!(r#"error: component "{id}" was not found"#),
        );
    }
    error
}
