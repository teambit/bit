//! Retain exact lane publication preimages across package lifecycle callbacks.
use super::{Prepared, export_staged_config, invalid, object_bytes, read_optional, refs_path};
use std::{collections::HashSet, fs, io};

impl Prepared {
    pub(super) fn reconcile(&mut self, exported_ids: &[String]) -> io::Result<()> {
        let ids = exported_ids
            .iter()
            .cloned()
            .collect::<HashSet<_>>();
        let before = crate::recovery::jsonc::parse(&self.published.bitmap.before)?;
        self.published.non_existing_ids =
            super::report::missing(&self.report, &before, exported_ids);
        let mut after = crate::recovery::jsonc::parse(&self.published.bitmap.after)?;
        for (key, row) in after.as_object_mut().ok_or_else(|| invalid("outbound lane bitmap"))? {
            let Some(old) = before
                .get(key)
                .filter(|row| row.get("rootDir").is_some())
            else {
                continue;
            };
            if !old["scope"]
                .as_str()
                .unwrap_or_default()
                .is_empty()
            {
                continue;
            }
            let identity = promoted_identity(key, row)?;
            if ids
                .iter()
                .any(|id| id.starts_with(&format!("{identity}@")))
            {
                self.published.updated_ids.push(identity);
            } else {
                *row = old.clone();
            }
        }
        sort_ids(&mut self.published.updated_ids);
        self.published.bitmap.after = crate::inspection::render_bitmap(&after)?;
        if let Some(config) = self.staged.config.as_mut() {
            config.after = export_staged_config(&config.before, &ids)?;
        }
        Ok(())
    }

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

    fn validate_files(&self) -> io::Result<bool> {
        let root = &self.workspace.root;
        Ok(fs::read(root.join(".bitmap"))? == self.published.bitmap.before
            && fs::read(crate::scope_path(root).join("scope.json"))?
                == self.published.scope.before
            && read_optional(&refs_path(root, &self.lane.scope, &self.lane.name))?
                == self.published.refs.before
            && read_optional(&crate::scope_path(root).join("staged-snaps"))?
                == self.staged.snaps
            && read_optional(&self.staged.config_path)?
                == self.staged.config.as_ref().map(|config| config.before.clone()))
    }

    fn validate_objects(&self) -> io::Result<bool> {
        let root = &self.workspace.root;
        Ok(fs::read(crate::scope_path(root).join("index.json"))? == self.objects.index
            && object_bytes(root, &self.objects.lane_hash)? == self.objects.lane
            && object_bytes(root, &self.objects.history_hash)? == self.objects.history)
    }
}

fn promoted_identity(key: &str, row: &serde_json::Value) -> io::Result<String> {
    let scope = row["scope"].as_str().ok_or_else(|| invalid("outbound lane promoted scope"))?;
    let key_id = key.rsplit_once('@').map_or(key, |(bare, _)| bare);
    let name = row["name"]
        .as_str()
        .filter(|val| !val.is_empty())
        .unwrap_or_else(|| {
            key_id
                .strip_prefix(&format!("{scope}/"))
                .unwrap_or(key_id)
        });
    Ok(format!("{scope}/{name}"))
}

fn sort_ids(ids: &mut [String]) {
    ids.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
}
