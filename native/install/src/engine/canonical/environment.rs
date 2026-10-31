//! Supply pnpm's synchronous configuration reader with the retained Host's
//! environment without changing this process's environment for other threads.

use pnpm_config::{EnvVar, EnvVarOs, GetCurrentDir, GetHomeDir, Host, LinkProbe};
use serde_json::Value;
use std::{
    cell::RefCell,
    collections::BTreeMap,
    env,
    ffi::OsString,
    io,
    path::{Path, PathBuf},
};

thread_local! {
    static CAPTURED: RefCell<Option<Captured>> = const { RefCell::new(None) };
}

#[derive(Clone)]
pub(super) struct Captured {
    pub(super) vars: BTreeMap<String, String>,
    cwd: PathBuf,
}

impl Captured {
    pub(super) fn parse(payload: &Value) -> Option<Self> {
        let mut vars = BTreeMap::new();
        for (key, value) in payload.get("environment")?.as_object()? {
            if value.is_null() {
                continue;
            }
            let text = match value {
                Value::String(text) => text.clone(),
                Value::Bool(flag) => flag.to_string(),
                Value::Number(number) => number.to_string(),
                _ => return None,
            };
            vars.insert(key.clone(), text);
        }
        let cwd = PathBuf::from(payload.get("cwd")?.as_str()?);
        cwd.is_absolute()
            .then_some(Self { vars, cwd })
    }

    pub(super) fn with<ReadValue>(&self, read: impl FnOnce() -> ReadValue) -> ReadValue {
        let previous = CAPTURED.with(|slot| slot.replace(Some(self.clone())));
        let _guard = Restore(previous);
        read()
    }

    /// pnpm's lifecycle executor inherits the Rust process environment and
    /// overlays `extra_env`. It cannot remove a variable the Host deleted.
    pub(super) fn can_inherit_parent(&self) -> bool {
        env::vars_os()
            .all(|(key, _)| {
                key.to_str()
                    .is_some_and(|key| self.get(key).is_some())
            })
    }

    fn get(&self, name: &str) -> Option<&str> {
        if cfg!(windows) {
            self.vars
                .iter()
                .find(|(key, _)| key.eq_ignore_ascii_case(name))
                .map(|(_, value)| value.as_str())
        } else {
            self.vars.get(name).map(String::as_str)
        }
    }
}

struct Restore(Option<Captured>);

impl Drop for Restore {
    fn drop(&mut self) {
        CAPTURED.with(|slot| {
            slot.replace(self.0.take());
        });
    }
}

pub(super) struct CapturedHost;

impl EnvVar for CapturedHost {
    fn var(name: &str) -> Option<String> {
        CAPTURED.with(|slot| {
            slot.borrow()
                .as_ref()?
                .get(name)
                .map(str::to_owned)
        })
    }

    fn vars() -> Vec<(String, String)> {
        CAPTURED.with(|slot| {
            slot.borrow()
                .as_ref()
                .map_or_else(Vec::new, |captured| {
                    captured.vars
                        .iter()
                        .map(|(key, value)| (key.clone(), value.clone()))
                        .collect()
                })
        })
    }
}

impl EnvVarOs for CapturedHost {
    fn var_os(name: &str) -> Option<OsString> {
        Self::var(name).map(OsString::from)
    }
}

impl GetHomeDir for CapturedHost {
    fn home_dir() -> Option<PathBuf> {
        if cfg!(unix) {
            Self::var_os("HOME").map(PathBuf::from).or_else(Host::home_dir)
        } else {
            Self::var_os("USERPROFILE")
                .filter(|value| !value.is_empty())
                .map(PathBuf::from)
                .or_else(Host::home_dir)
        }
    }
}

impl GetCurrentDir for CapturedHost {
    fn current_dir() -> io::Result<PathBuf> {
        CAPTURED.with(|slot| {
            slot.borrow()
                .as_ref()
                .map(|captured| captured.cwd.clone())
                .ok_or_else(|| io::Error::other("retained Host current directory unavailable"))
        })
    }
}

impl LinkProbe for CapturedHost {
    fn can_link_between_dirs(from_dir: &Path, to_dir: &Path) -> bool {
        Host::can_link_between_dirs(from_dir, to_dir)
    }
}
