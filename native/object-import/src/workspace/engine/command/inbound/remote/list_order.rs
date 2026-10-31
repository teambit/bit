//! Forking uses sorted model names for file scopes and untouched HTTP response order.
use super::file_list;
use bit_client_transfer::{
    http::{Listed, Network},
    remotes::Remote,
};
use std::io;

pub(super) async fn main(
    remote: &Remote,
    scope: &str,
    namespaces: &str,
    network: &Network,
    fork_order: bool,
) -> io::Result<Vec<Listed>> {
    match remote {
        Remote::Http(url) => network.list(url, Some(namespaces)).await,
        Remote::File(path) => {
            let mut rows = file_list::list(path, scope, namespaces)?;
            if fork_order {
                file_order(&mut rows);
            }
            Ok(rows)
        }
    }
}

pub(super) fn file_order(rows: &mut [Listed]) {
    if rows.len() <= 1 {
        return;
    }
    rows.sort_by(|left, right| {
        left.name
            .trim()
            .to_uppercase()
            .encode_utf16()
            .cmp(
                right.name
                    .trim()
                    .to_uppercase()
                    .encode_utf16(),
            )
    });
}
