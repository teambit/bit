use super::{
    FetchOptions, MAX_INBOUND_BYTES, Remote, VirtualRemote, collect, connection, invalid, lane,
    remote_lane,
};
use std::{io, path::Path};
/// Lane-history refresh fetches no component closure and never publishes a Lane locally.
pub(in crate::workspace::engine::command) fn history_remote(
    root: &Path,
    home: &Path,
    transport: &super::super::Transport,
    id: &lane::Id,
) -> io::Result<Option<(VirtualRemote, String)>> {
    history_remote_at(root, home, transport, id, false, None)
}

pub(in crate::workspace::engine::command) fn history_remote_at(
    root: &Path,
    home: &Path,
    transport: &super::super::Transport,
    id: &lane::Id,
    bare: bool,
    remote_host: Option<&str>,
) -> io::Result<Option<(VirtualRemote, String)>> {
    id.validate()?;
    let (remotes, network, _, _) = if bare {
        connection::bare(root, transport)?
    } else {
        connection::with_home(root, transport, home)?
    };
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    runtime.block_on(async {
        let remote = match remote_host
            .map(str::trim)
            .filter(|host| !host.is_empty())
        {
            Some(host) => Remote::from_host(host)?,
            None => remotes.resolve(&id.scope, &network).await?,
        };
        let Remote::Http(url) = remote else {
            return Ok(None);
        };
        let mut options = FetchOptions::lanes();
        options.selection.include_lane_history = true;
        let items = network.fetch_bounded(
            &url,
            &[format!("{}/{}", id.scope, id.name)],
            &options,
            MAX_INBOUND_BYTES,
        )
        .await?;
        let (hash, _) = remote_lane(id, &items)?;
        let (mut rows, _) = collect((Vec::new(), 0), root, id.scope.clone(), Some(items))?;
        let mut row = rows.pop().ok_or_else(|| invalid("lane history remote"))?;
        if bare {
            row.path = root.join(".rust-inbound-virtual").join(&id.scope);
        }
        Ok(Some((row, hash)))
    })
}
