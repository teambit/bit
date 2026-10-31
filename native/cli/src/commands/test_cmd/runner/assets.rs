//! Materialize stable native-owned external-tool configuration assets.
use sha1::{Digest, Sha1};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub(super) struct Assets {
    pub root: PathBuf,
}
const FILES: [(&str, &str); 7] = [
    ("runner.cjs", include_str!("tool.cjs")),
    ("babel.cjs", include_str!("assets/babel.cjs")),
    ("css.cjs", include_str!("assets/css.cjs")),
    ("file.cjs", include_str!("assets/file.cjs")),
    ("setup.cjs", include_str!("assets/setup.cjs")),
    ("snapshot.cjs", include_str!("assets/snapshot.cjs")),
    ("svg.cjs", include_str!("assets/svg.cjs")),
];
impl Assets {
    pub(super) fn prepare(package: &Path) -> io::Result<Self> {
        if package.as_os_str().is_empty()
            || package
                .to_string_lossy()
                .trim()
                .is_empty()
        {
            return Err(io::Error::other("tester package path is empty"));
        }
        let payloads = build_payloads(package)?;
        let parent = bit_workspace_config::cache_root().join("native-tools/jest");
        let root = parent.join(payload_hash(&payloads));
        if root.try_exists()? {
            validate(&root, &payloads)?;
            return Ok(Self { root });
        }
        fs::create_dir_all(&parent)?;
        let staging = tempfile::Builder::new().prefix("assets-").tempdir_in(&parent)?;
        for (name, source) in &payloads {
            fs::write(staging.path().join(name.trim()), source)?;
        }
        if let Err(error) = fs::rename(staging.path(), &root)
            && !root.try_exists()?
        {
            return Err(error);
        }
        validate(&root, &payloads)?;
        Ok(Self { root })
    }
}

fn build_payloads(package: &Path) -> io::Result<Vec<(&'static str, String)>> {
    let prefix = format!(
        "const installation = require('node:module').createRequire({});\n",
        serde_json::to_string(package)?,
    );
    Ok(FILES
        .iter()
        .map(|(name, source)| (name.trim(), format!("{prefix}{source}")))
        .collect())
}

fn payload_hash(payloads: &[(&str, String)]) -> String {
    let mut hash = Sha1::new();
    for (name, source) in payloads {
        hash.update(name.trim().as_bytes());
        hash.update([0]);
        hash.update(source.as_bytes());
        hash.update([0]);
    }
    format!("{:x}", hash.finalize())
}
fn validate(root: &Path, files: &[(&str, String)]) -> io::Result<()> {
    if !fs::symlink_metadata(root)?.file_type().is_dir() {
        return Err(io::Error::other("tester assets directory"));
    }
    for (name, source) in files {
        let path = root.join(name.trim());
        if !fs::symlink_metadata(&path)?.file_type().is_file()
            || fs::read(&path)? != source.as_bytes()
        {
            return Err(io::Error::other("tester asset integrity"));
        }
    }
    Ok(())
}
