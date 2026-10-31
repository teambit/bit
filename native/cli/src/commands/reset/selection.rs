//! Resolve reset selectors before preparing one main or lane batch.
use crate::commands::{
    diff::selection,
    engine::Engine,
    list::bitmap,
    patterns,
    status::{
        autosync::Startup,
        capture::{self, CaptureOptions},
        environments,
        js::{array, decline},
    },
    workspace_command,
};
use bit_install::{output::Output, policy::scope::read_proof};
use serde_json::{Value, json};
use std::{io, path::Path, sync::Arc};

pub(super) const LANE_CI_DIAGNOSTIC: &str = "CI lane reset diagnostics require the published stack";

pub(super) fn complex(pattern: &str) -> bool {
    pattern.contains(['*', '?', '[', ']', '{', '}', '!', ',', '$', ' '])
}

pub(super) fn identity(root: &Path, pattern: &str) -> io::Result<(String, bool)> {
    let bitmap = bitmap::read(root)?;
    let matched: Vec<_> = bitmap.entries
        .iter()
        .filter(|entry| {
            entry.identity == pattern
                || entry.identity
                    .split_once('/')
                    .is_some_and(|(_, name)| name == pattern)
        })
        .collect();
    if matched.len() != 1 {
        return Err(io::Error::other("reset identity absent or ambiguous"));
    }
    if !matched[0].on_current_lane_including_removed(&[]) || matched[0].staged_deprecation {
        return Err(io::Error::other("reset component unavailable on main"));
    }
    Ok((matched[0].identity.clone(), bitmap.lane.is_some()))
}

pub(super) fn identities(root: &Path, pattern: &str) -> io::Result<Vec<String>> {
    let bitmap = bitmap::read(root)?;
    let pool = bitmap.entries
        .iter()
        .filter(|entry| entry.on_current_lane_including_removed(&[]))
        .map(|entry| entry.identity.as_str())
        .collect::<Vec<_>>();
    let selected = if complex(pattern) {
        if pattern.contains('$') || pattern.contains(" AND ") {
            return Err(decline("reset state selector requires workspace facts"));
        }
        patterns::extended::matching(&pool, &patterns::split(pattern))?
    } else {
        pool.iter()
            .copied()
            .filter(|identity| {
                *identity == pattern
                    || identity
                        .split_once('/')
                        .is_some_and(|(_, name)| name == pattern)
            })
            .collect()
    };
    if selected.is_empty() {
        return Err(decline("reset component pattern has no matches"));
    }
    Ok(selected
        .into_iter()
        .map(str::to_string)
        .collect())
}

#[derive(Clone)]
pub(super) struct Selected {
    pub identities: Vec<String>,
    loads: Vec<usize>,
    stdout: String,
    proofs: Vec<Value>,
    _capture: Option<Arc<capture::Capture>>,
}

impl Selected {
    pub fn ordinary(identities: Vec<String>) -> Self {
        Self {
            identities,
            loads: Vec::new(),
            stdout: String::new(),
            proofs: Vec::new(),
            _capture: None,
        }
    }
    pub fn render(&self, output: &Output) {
        output.raw(&self.stdout);
        for count in &self.loads {
            output.status(&format!("loading {count} component(s)"));
        }
    }
    pub fn verify(&self) -> io::Result<()> {
        if self.proofs.is_empty() {
            return Ok(());
        }
        let mut engine = Engine::new()?;
        let _: Value = engine.request(&json!({"kind":"readSetValidate","proofs":self.proofs}))?;
        Ok(())
    }
}

pub(super) fn stateful(pattern: &str) -> bool {
    selection::stateful(pattern)
}

pub(super) fn states(root: &Path, pattern: &str, startup: &mut Startup) -> io::Result<Selected> {
    let home = workspace_command::home();
    let mut engine = Engine::new()?;
    let (context, environments) =
        environments::read_context(&mut engine, root, &home, false, None, startup)?;
    let targets = array(context.get("targets"), "reset selector targets")?;
    let options = CaptureOptions {
        environments: Some(environments.for_checkout()),
        missing_status_invalid: true,
        allow_special_states: true,
        ..CaptureOptions::default()
    };
    let capture = capture::capture_with(&mut engine, root, &home, &context, targets, options)?;
    let mut proofs = source_proofs(root, &capture)?;
    let result =
        selection::select_capture(&mut engine, root, &context, targets, pattern, &capture)?;
    if proofs != source_proofs(root, &capture)? {
        return Err(decline("reset predicate sources changed"));
    }
    proofs.extend(capture.dependency_read_set());
    proofs.extend(
        context["controlReadSet"]
            .as_array()
            .into_iter()
            .flatten()
            .cloned(),
    );
    startup.stdout.push_str(&capture::callback_startup_stdout(&capture));
    let identities = result.0
        .iter()
        .filter_map(|target| target["identity"].as_str().map(str::to_owned))
        .collect();
    let selected = Selected {
        identities,
        loads: result.1,
        stdout: capture::callback_load_stdout(&capture),
        proofs,
        _capture: Some(Arc::new(capture)),
    };
    selected.verify()?;
    Ok(selected)
}

fn source_proofs(root: &Path, capture: &capture::Capture) -> io::Result<Vec<Value>> {
    capture.captured
        .iter()
        .flat_map(|component| {
            let directory = root.join(component["directory"].as_str().unwrap_or_default());
            component["files"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .map(move |file| directory.join(file))
        })
        .map(|path| read_proof(&path))
        .collect()
}

pub(super) fn lane_failure(
    args: &[std::ffi::OsString],
    root: &Path,
    selected: Option<&Selected>,
    error: &io::Error,
) -> io::Result<crate::native::Outcome> {
    if std::env::var_os("CI").is_some_and(|value| !value.is_empty()) {
        return Ok(crate::native::Outcome::Declined(LANE_CI_DIAGNOSTIC.into()));
    }
    crate::commands::workspace_command::execute_then(root, args, "reset", |output| {
        if let Some(selected) = selected {
            selected.render(output);
            selected.verify()?;
        }
        bit_object_import::reset_lane::apply_error_prefix(error)?;
        // defaultErrorHandler colors a non-BitError message before its outer red wrapper.
        Err(io::Error::new(
            error.kind(),
            crate::commands::color::Chalk::detect(args).red(&error.to_string()),
        ))
    })
}
