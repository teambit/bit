//! Workspace state patterns execute each loading criterion lazily, in published order.
pub(super) use facts::Facts;

mod code;
mod facts;
mod grammar;

use super::{ProjectedLinker, controls};
use crate::commands::{
    diff::selection, engine::Engine, patterns, remove::preparation, workspace_command,
};
use bit_install::output::Output;
use serde_json::{Value, json};
use std::{io, path::Path};

impl ProjectedLinker {
    pub(in crate::commands) fn state_pattern(pattern: &str) -> bool {
        let trimmed = pattern.trim();
        !trimmed.is_empty() && selection::stateful(trimmed)
    }
    /// Prove native context eligibility before any configured provider starts.
    pub(in crate::commands) fn preflight_selection(root: &Path, bitmap: &Value) -> io::Result<()> {
        let mut engine = Engine::new()?;
        let context: Value = engine.request(&json!({"kind":"trackingContext","root":root,
            "home":workspace_command::home(),"bitmap":bitmap}))?;
        controls::validate(&mut engine, &context)
    }

    pub(in crate::commands) fn select_workspace(
        &mut self,
        root: &Path,
        bitmap: &Value,
        pattern: &str,
        output: &Output,
    ) -> io::Result<Vec<String>> {
        if !Self::state_pattern(pattern) {
            return preparation::ids(root, pattern);
        }
        let context = self.selection_context(root, bitmap)?;
        let request = Request { root, bitmap, context: &context, output };
        let targets = context["targets"]
            .as_array()
            .ok_or_else(|| io::Error::other("selector targets"))?
            .iter()
            .filter(|row| row["locallyRemoved"] != true)
            .cloned()
            .collect::<Vec<_>>();
        let parts = patterns::split(pattern);
        let mut selected = grammar::ordinary(&targets, &parts)?;
        for branch in parts.iter().filter(|part| Self::state_pattern(part)) {
            let mut pool = targets.clone();
            for criterion in branch
                .split(" AND ")
                .map(str::trim)
                .filter(|criterion| !criterion.is_empty())
            {
                pool = self.criterion(&request, pool, criterion)?;
            }
            grammar::union(&mut selected, pool);
        }
        if selected.is_empty() {
            return Err(grammar::no_matches(pattern));
        }
        Ok(grammar::identities(&selected))
    }

    fn selection_context(&mut self, root: &Path, bitmap: &Value) -> io::Result<Value> {
        let mut engine = Engine::new()?;
        let context: Value = engine.request(&json!({"kind":"trackingContext","root":root,
            "home":workspace_command::home(),"bitmap":bitmap}))?;
        controls::validate(&mut engine, &context)?;
        self.retained.keep_controls(
            context["controlReadSet"]
                .as_array()
                .map_or(&[], Vec::as_slice),
        )?;
        Ok(context)
    }

    fn criterion(
        &mut self,
        request: &Request<'_>,
        targets: Vec<Value>,
        entered: &str,
    ) -> io::Result<Vec<Value>> {
        grammar::validate(entered)?;
        let ids = grammar::identities(&targets);
        if ids.is_empty() {
            return Ok(targets);
        }
        if grammar::loads(entered) {
            self.load_criterion(request, &ids)?;
        }
        let compared = self.compare_criterion(request, entered, &ids)?;
        let rows = if grammar::loads(entered) { self.retained.rows(&ids)? } else { Vec::new() };
        selection::criterion(
            request.context,
            targets,
            &grammar::applied(entered),
            &rows,
            &self.retained.facts.environments,
            &compared,
        )
    }

    fn load_criterion(&mut self, request: &Request<'_>, ids: &[String]) -> io::Result<()> {
        request.output.status(&format!("loading {} component(s)", ids.len()));
        let missing = self.retained.missing(ids);
        if !missing.is_empty() {
            let chalk =
                crate::commands::color::Chalk::detect(&std::env::args_os().collect::<Vec<_>>());
            crate::commands::delete::loading::validate(
                request.root,
                request.bitmap,
                &missing,
                chalk,
            )?;
        }
        self.capture_cached(request.root, request.bitmap, ids)?;
        print!("{}", self.take_stdout());
        Ok(())
    }

    fn compare_criterion(
        &mut self,
        request: &Request<'_>,
        entered: &str,
        ids: &[String],
    ) -> io::Result<Value> {
        let mut engine = Engine::new()?;
        match entered.trim() {
            "$modified" => self.compare_status(&mut engine, request.root, request.context, ids),
            "$codeModified" => {
                let (result, proofs) =
                    code::compare(&mut engine, request.root, request.bitmap, request.context, ids)?;
                self.retained.add_proofs(proofs);
                Ok(result)
            }
            _ => Ok(json!({"comparisons":[]})),
        }
    }

    pub(super) fn compare_status(
        &mut self,
        engine: &mut Engine,
        root: &Path,
        context: &Value,
        ids: &[String],
    ) -> io::Result<Value> {
        facts::history(engine, root, context, ids)?;
        let compared = self.retained.facts.compare(engine, root, ids)?;
        self.retained.status(&compared, ids);
        Ok(compared)
    }
}

struct Request<'a> {
    root: &'a Path,
    bitmap: &'a Value,
    context: &'a Value,
    output: &'a Output,
}
