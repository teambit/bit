//! `ScopeComponentLoader`'s remote object cache: inspect a fetch without publishing it.
pub(crate) mod objects;
use bit_client_transfer::{
    fetch::FetchOptions,
    http::Network,
    remotes::{Remote, Remotes},
};
use std::{collections::BTreeMap, io};
/// Fetch only into Rust memory. Recovery imports are a separate later publication owner.
pub fn probe_remote(
    ids: &[String],
    remotes: &Remotes,
    network: &Network,
) -> io::Result<BTreeMap<String, bool>> {
    if ids.is_empty() {
        return Ok(BTreeMap::new());
    }
    if ids.len() > 4096 {
        return Err(super::batch::unsupported("recovery remote probe component budget"));
    }
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?
        .block_on(async {
            let options = FetchOptions::without_dependencies(None);
            let mut result = BTreeMap::new();
            for id in ids {
                let trimmed = id.trim();
                let scope = extract_scope(trimmed)?;
                let owned_id = trimmed.to_owned();
                let deleted = match remotes.resolve(scope, network).await? {
                    Remote::File(path) => objects::file(&path, &owned_id)?,
                    Remote::Http(url) => {
                        let items = network.fetch_bounded(
                            &url,
                            std::slice::from_ref(&owned_id),
                            &options,
                            128 * 1024 * 1024,
                        )
                        .await?;
                        objects::http(&items, &owned_id)?
                    }
                };
                result.insert(owned_id, deleted);
            }
            Ok(result)
        })
}

#[inline]
fn extract_scope(trimmed: &str) -> io::Result<&str> {
    let bare = trimmed.rsplit_once('@').map_or(trimmed, |(prefix, _)| prefix.trim());
    bare.split_once('/')
        .filter(|(scope, name)| !scope.trim().is_empty() && !name.trim().is_empty())
        .map(|(scope, _)| scope.trim())
        .ok_or_else(|| super::batch::invalid("recovery remote identity"))
}
