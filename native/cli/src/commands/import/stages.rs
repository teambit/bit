//! Native graph selection and write-dependency continuations retain one inbound owner.
use super::{Planned, lifecycle::Lifecycle, options::Options, output, prepare_into, report};
use crate::commands::{
    color::Chalk,
    engine::Engine,
    workspace_command::{self, progress::Progress},
};
use bit_install::output::Output;
use serde_json::{Value, json};
use std::{io, path::Path};

impl Planned {
    pub(super) fn plan_graph(
        root: &Path,
        options: &Options,
        ids: &[String],
        chalk: Chalk,
        lifecycle: &mut Lifecycle,
        output: &Output,
    ) -> io::Result<Self> {
        let mut engine = Engine::new()?;
        let mut prepared = prepare_into(&mut engine, root, options, ids)?;
        if prepared["requiresDependentsGraph"] != true {
            return Err(io::Error::other("native dependents graph phase missing"));
        }
        let lane = has_active_lane(&prepared["currentLane"]);
        let rows = json!({"bitmapCount":0,"imports":prepared["progress"],"loads":[]});
        if let Some(progress) = Progress::parse(Some(&rows))? {
            progress.render_inbound(
                output,
                false,
                options.wildcards().is_empty() && !options.ids.is_empty(),
                !options.wildcards().is_empty(),
                None,
                lane,
            );
        }
        output.status("finding dependents");
        let graph = lifecycle.capture_phase(root, "graph")?;
        prepared = engine.request(&json!({"kind":"commandInboundCompleteDependents","token":prepared["token"],"graph":graph}))?;
        lifecycle.acknowledge(root, &prepared)?;
        let rows = json!({"bitmapCount":0,"imports":prepared["graphProgress"],"loads":[]});
        if let Some(progress) = Progress::parse(Some(&rows))? {
            progress.render_inbound_continuation(output, has_active_lane(&prepared["currentLane"]));
        }
        Self::from_prepared(engine, prepared, options, ids, chalk, true)
    }
    pub(super) fn write_dependencies(
        &mut self,
        root: &Path,
        options: &Options,
        lifecycle: &mut Lifecycle,
    ) -> io::Result<()> {
        let captured = lifecycle.dependency_facts(root)?;
        let mut completed: Value = self.engine.request(&json!({"kind":"commandInboundWriteDependencies","token":self.prepared["token"],"facts":captured["facts"],"readSet":captured["readSet"]}))?;
        if let Some(receipt) = completed
            .get("checkoutPolicyPreparation")
            .filter(|value| !value.is_null())
        {
            let semver = workspace_command::checkout_policy::semver(receipt)?;
            completed = self.engine.request(&json!({"kind":"commandInboundPolicyComplete","token":self.prepared["token"],"semver":semver}))?;
        }
        if completed["completed"] != true
            || completed["token"] != self.prepared["token"]
            || self.prepared["token"]
                .as_str()
                .is_none_or(|tok| tok.trim().is_empty())
        {
            return Err(io::Error::other("native import dependency completion"));
        }
        let receipt = report::validate(&completed)?;
        if receipt.ids != self.receipt.ids
            || completed["importDetails"] != self.prepared["importDetails"]
        {
            return Err(io::Error::other("native import dependency receipt changed"));
        }
        self.report = if options.output.json {
            output::json_report(&completed, false, false)?
        } else {
            receipt.import_report(self.chalk, None)?
        };
        self.prepared = completed;
        self.receipt = receipt;
        Ok(())
    }
}

fn has_active_lane(value: &Value) -> bool {
    value
        .as_str()
        .or_else(|| value.get("name").and_then(Value::as_str))
        .or_else(|| value.get("id").and_then(Value::as_str))
        .map(str::trim)
        .is_some_and(|name| !name.is_empty() && name != "main" && !name.ends_with("/main"))
}
