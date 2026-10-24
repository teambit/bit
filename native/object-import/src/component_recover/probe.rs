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
    if ids.len() > 4096 {
        return Err(super::batch::unsupported("recovery remote probe component budget"));
    }
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?
        .block_on(async {
            let mut result = BTreeMap::new();
            for id in ids {
                let (scope, _) = id
                    .split_once('/')
                    .ok_or_else(|| super::batch::invalid("recovery remote identity"))?;
                let deleted = match remotes.resolve(scope, network).await? {
                    Remote::File(path) => objects::file(&path, id)?,
                    Remote::Http(url) => {
                        let items = network.fetch_bounded(
                            &url,
                            std::slice::from_ref(id),
                            &FetchOptions::without_dependencies(None),
                            128 * 1024 * 1024,
                        )
                        .await?;
                        objects::http(&items, id)?
                    }
                };
                result.insert(id.clone(), deleted);
            }
            Ok(result)
        })
}
