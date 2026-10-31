//! Keep published providers and export callbacks in one session around native publication.
use crate::{
    commands::{
        engine::Engine,
        status::{environments::Environments, js::array},
        workspace_command,
    },
    discovery::{self, Target},
    host::Host,
};
use serde_json::{Value, json};
use std::{
    io,
    path::{Path, PathBuf},
    sync::Arc,
};

pub(super) struct Lifecycle {
    host: Option<Arc<Host>>,
    root: PathBuf,
}

impl Lifecycle {
    pub(super) fn protect(&self, quiet: bool) -> io::Result<Protection<'_>> {
        if let Some(host) = &self.host {
            host.call("exportInterrupt", &json!({"enabled":true}))?;
        }
        let guard = super::interrupt::Guard::new(quiet)
            .inspect_err(|_| {
                if let Some(host) = &self.host {
                    let _ = host.call("exportInterrupt", &json!({"enabled":false}));
                }
            })?;
        Ok(Protection { guard: Some(guard), host: self.host.as_deref() })
    }
    pub(super) fn bootstrap(root: &Path, engine: &mut Engine, force: bool) -> io::Result<Self> {
        let context: Value = engine.request(&json!({
            "kind":"statusContext", "root":root, "home":workspace_command::home(), "history":false,
        }))?;
        let targets = array(context.get("targets"), "export callback targets")?;
        if !force
            && !external_resolver(root)?
            && !root_aspects(&context)?
            && Environments::require_native_write_for(root, &context, targets).is_ok()
        {
            return Ok(Self { host: None, root: root.to_owned() });
        }
        let Target::Entry(cli) = discovery::find()? else {
            return Err(io::Error::other("export callbacks require the published CLI"));
        };
        let host = Host::new(
            cli,
            root.to_owned(),
            crate::commands::color::Chalk::detect(&std::env::args_os().collect::<Vec<_>>())
                .enabled(),
        );
        host.call("exportBootstrap", &json!({}))
            .map_err(|error| {
                crate::host::callback_error::CallbackError::wrap(
                    error,
                    host.take_stdout(),
                    String::new(),
                )
            })?;
        Ok(Self { host: Some(Arc::new(host)), root: root.to_owned() })
    }

    pub(super) fn file_actions(&self) -> Option<bit_object_import::export_actions::Handler> {
        self.host
            .as_ref()
            .map(|host| {
                let host = Arc::clone(host);
                bit_object_import::export_actions::Handler::new(move |path, name, options| {
                    let response = host.call(
                        "exportFileAction",
                        &json!({"path":path,"name":name,"options":options}),
                    )?;
                    file_action_response(&response)
                })
            })
    }

    pub(super) fn take_stdout(&self) -> String {
        self.host.as_ref().map_or_else(String::new, |host| host.take_stdout())
    }

    pub(super) fn native_packages(&self) -> bool {
        self.host.is_none()
    }

    pub(super) fn packages(&self, staged: &Value) -> io::Result<()> {
        if let Some(host) = &self.host {
            host.call("exportPackages", &json!({
                "updatedLocally":staged["updatedLocally"], "exportedLanes":staged["exportedLanes"],
            }))?;
        } else {
            super::packages::link(&self.root, staged)?;
        }
        Ok(())
    }

    pub(super) fn finish(
        &self,
        receipt: &Value,
        eject: bool,
        open_browser: bool,
    ) -> io::Result<Value> {
        let metadata = match &self.host {
            Some(host) => host.call(
                "exportFinish",
                &json!({"receipt":receipt,"eject":eject,"openBrowser":open_browser}),
            )?,
            None => json!({"ejectResults":null}),
        };
        if let Err(error) = super::cloud::remember(&self.root, receipt, &metadata) {
            crate::trace::log(format!("failed to write last-export.json: {error}"));
        }
        Ok(metadata)
    }
}

pub(super) struct Protection<'a> {
    guard: Option<super::interrupt::Guard>,
    host: Option<&'a Host>,
}
impl Protection<'_> {
    pub(super) fn finish(mut self) -> io::Result<()> {
        self.guard.take();
        if let Some(host) = self.host.take() {
            host.call("exportInterrupt", &json!({"enabled":false}))?;
        }
        Ok(())
    }
}
impl Drop for Protection<'_> {
    fn drop(&mut self) {
        self.guard.take();
        if let Some(host) = self.host.take() {
            let _ = host.call("exportInterrupt", &json!({"enabled":false}));
        }
    }
}

fn root_aspects(context: &Value) -> io::Result<bool> {
    let core: Vec<String> = serde_json::from_str(include_str!(
        "../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))?;
    Ok(context["workspace"]
        .as_object()
        .is_some_and(|config| {
            config
                .iter()
                .filter(|(_, val)| {
                    *val != &Value::Bool(false) && val.as_str().map(str::trim) != Some("-")
                })
                .any(|(id, _)| {
                    let bare = bit_install::config::aspect_id_without_version(id.trim());
                    bare.contains('/')
                        && !core.iter().any(|item| item == bare)
                        && !bit_install::policy::is_core_env(bare)
                })
        }))
}

fn external_resolver(root: &Path) -> io::Result<bool> {
    let config: Value = bit_object_import::parse_jsonc(&std::fs::read(
        bit_object_import::scope_path(root).join("scope.json"),
    )?)?;
    Ok(config["resolverPath"]
        .as_str()
        .is_some_and(|path| !path.trim().is_empty()))
}

fn file_action_response(response: &Value) -> io::Result<Value> {
    let is_ok = response["ok"] == true
        || response["ok"]
            .as_str()
            .is_some_and(|text| text.trim().eq_ignore_ascii_case("true"));
    if is_ok {
        Ok(response["value"].clone())
    } else {
        Err(io::Error::other(
            response["message"]
                .as_str()
                .map(str::trim)
                .filter(|msg| !msg.is_empty())
                .unwrap_or("file action failed"),
        ))
    }
}
