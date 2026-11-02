//! Retain exact [`Prepared`] lane publication preimages across package lifecycle callbacks.

use super::{Prepared, export_staged_config, invalid, object_bytes, read_optional, refs_path};
use std::{collections::HashSet, fs, io};

impl Prepared {
    /// Reconciles `.bitmap` and staged configuration updates against acknowledged `exported_ids`.
    pub(super) fn reconcile(&mut self, exported_ids: &[String]) -> io::Result<()> {
        let ids = exported_ids
            .iter()
            .map(|id| id.trim().to_owned())
            .collect::<HashSet<_>>();
        let before = crate::recovery::jsonc::parse(&self.published.bitmap.before)?;
        self.published.non_existing_ids =
            super::report::missing(&self.report, &before, exported_ids);
        self.published.updated_ids.clear();
        let mut after = crate::recovery::jsonc::parse(&self.published.bitmap.after)?;
        for (key, row) in after.as_object_mut().ok_or_else(|| invalid("outbound lane bitmap"))? {
            let Some(old) = before.get(key) else { continue };
            if old.get("rootDir").is_none()
                || !old["scope"]
                    .as_str()
                    .is_none_or(|scope| scope.trim().is_empty())
            {
                continue;
            }
            let identity = promoted_identity(key, row)?;
            if ids
                .iter()
                .any(|id| id.rsplit_once('@').map(|(bare, _)| bare) == Some(identity.as_str()))
            {
                self.published.updated_ids.push(identity);
            } else {
                *row = old.clone();
            }
        }
        sort_ids(&mut self.published.updated_ids);
        self.published.updated_ids.dedup();
        self.published.bitmap.after = crate::inspection::render_bitmap(&after)?;
        if let Some(config) = self.staged.config.as_mut() {
            config.after = export_staged_config(&config.before, &ids)?;
        }
        Ok(())
    }

    /// Verifies that local control files, lane objects, and component models match their captured preimages.
    pub(super) fn validate(&self) -> io::Result<()> {
        if !self.validate_files()? || !self.validate_objects()? {
            return Err(invalid("outbound lane local state changed"));
        }
        for model in &self.models {
            if model.hash.len() != 40 || !model.hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                return Err(invalid("outbound lane model hash"));
            }
            let path = crate::scope_path(&self.workspace.root)
                .join("objects")
                .join(&model.hash[..2])
                .join(&model.hash[2..]);
            if fs::read(path)? != model.before {
                return Err(invalid("outbound lane local model changed"));
            }
        }
        Ok(())
    }

    /// Returns `true` when `.bitmap`, `scope.json`, remote refs, and staged files match their captured preimages.
    #[inline]
    fn validate_files(&self) -> io::Result<bool> {
        let root = &self.workspace.root;
        Ok(fs::read(root.join(".bitmap"))? == self.published.bitmap.before
            && fs::read(crate::scope_path(root).join("scope.json"))?
                == self.published.scope.before
            && read_optional(&refs_path(root, &self.lane.scope, &self.lane.name))?
                == self.published.refs.before
            && read_optional(&crate::scope_path(root).join("staged-snaps"))?
                == self.staged.snaps
            && read_optional(&self.staged.config_path)?.as_deref()
                == self.staged.config.as_ref().map(|config| config.before.as_slice()))
    }

    /// Returns `true` when `index.json`, the lane object, and `LaneHistory` match their captured preimages.
    fn validate_objects(&self) -> io::Result<bool> {
        let root = &self.workspace.root;
        Ok(fs::read(crate::scope_path(root).join("index.json"))? == self.objects.index
            && object_bytes(root, &self.objects.lane_hash)? == self.objects.lane
            && object_bytes(root, &self.objects.history_hash)? == self.objects.history)
    }
}

fn promoted_identity(key: &str, row: &serde_json::Value) -> io::Result<String> {
    let scope = row["scope"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .ok_or_else(|| invalid("outbound lane promoted scope"))?;
    let key = key.trim();
    let key_id = key.rsplit_once('@').map_or(key, |(bare, _)| bare.trim());
    let name = row["name"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .unwrap_or_else(|| {
            key_id
                .strip_prefix(scope)
                .and_then(|rest| rest.strip_prefix('/'))
                .unwrap_or(key_id)
                .trim()
        });
    if name.is_empty() {
        return Err(invalid("outbound lane promoted name"));
    }
    Ok(format!("{scope}/{name}"))
}

#[inline]
fn sort_ids(ids: &mut [String]) {
    ids.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
}
