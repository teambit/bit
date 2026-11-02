//! Forking ([`main`], [`Remote`], [`Listed`]) uses sorted model names for file scopes and preserves untouched HTTP response order.

use super::file_list;
use bit_client_transfer::{
    http::{Listed, Network},
    remotes::Remote,
};
use std::io;

/// Lists main-scope components from `remote`, applying sorted model order for file remotes when `fork_order` is set.
pub(super) async fn main(
    remote: &Remote,
    scope: &str,
    namespaces: &str,
    network: &Network,
    fork_order: bool,
) -> io::Result<Vec<Listed>> {
    match remote {
        Remote::Http(url) => {
            let scope = scope.trim();
            let rows = network.list(url, Some(namespaces)).await?;
            if rows.len() > 16384
                || rows
                    .iter()
                    .any(|row| row.scope.trim() != scope || row.name.trim().is_empty())
            {
                return Err(super::invalid("inbound HTTP list result"));
            }
            Ok(rows)
        }
        Remote::File(path) => {
            let mut rows = file_list::list(path, scope, namespaces)?;
            if fork_order {
                file_order(&mut rows);
            }
            Ok(rows)
        }
    }
}

/// Sorts file-scope [`Listed`] rows by uppercase UTF-16 code units of `name` (then `(scope, name)`) to match `ForkingMain` order.
#[inline]
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
            .then_with(|| {
                (left.scope.trim(), left.name.trim()).cmp(&(right.scope.trim(), right.name.trim()))
            })
    });
}
