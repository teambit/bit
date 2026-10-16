//! Native soft deletion of a tracked mainline or exported-lane component.

mod policy;

use super::{
    color::Chalk,
    status,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{commands::Command, native::Outcome, workspace};
use bit_object_import::component_delete::{Plan, Scope};
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "delete", aliases: &[], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".into()));
    };
    let Some((name, scope, lane)) = parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native delete grammar".into()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    let prepared = match Prepared::prepare(&root, name, scope, lane) {
        Ok(prepared) => prepared,
        Err(error) => return Ok(Outcome::Declined(format!("delete: {error}"))),
    };
    execute(&root, args, prepared)
}

fn execute(root: &Path, args: &[OsString], mut prepared: Prepared) -> io::Result<Outcome> {
    let plan = &prepared.plan;
    let format = Formatter::new(Chalk::detect(args));
    let items = if plan.entire() { format.item(plan.full_id()) } else { String::new() };
    let report = Report {
        data: Formatter::join(&[
            format.success_summary("successfully deleted the following components"),
            items,
            format.hint(r#"to update the remote, please tag/snap and then export. to revert, please use "bit recover""#),
        ]),
        code: 0,
        details: None,
    };
    let file_id = workspace_command::file_id();
    workspace_command::execute_with(root, args, "delete", &report, |output| {
        prepared.validate(root)?;
        output.status("loading 1 component(s)");
        if prepared.plan.policy_loaded() {
            output.status("loading 1 component(s)");
        }
        prepared.plan.commit(&file_id)?;
        if let Some(policy) = &prepared.policy
            && policy.commit(root, &file_id).is_ok()
        {
            output.console(&policy.report(&format));
        }
        Ok(())
    })
}

struct Prepared {
    plan: Plan,
    graph: Option<status::DeleteGraph>,
    policy: Option<policy::Policy>,
}

impl Prepared {
    fn prepare(root: &Path, name: &str, scope: Scope, lane: bool) -> io::Result<Self> {
        let graph = if lane && matches!(scope, Scope::Entire) && Plan::needs_dependency_graph(root)?
        {
            Some(status::DeleteGraph::read(root)?)
        } else {
            None
        };
        let plan = match &graph {
            Some(graph) => {
                Plan::prepare_lane_with_dependencies(root, name, scope, &graph.components)?
            }
            None if lane => Plan::prepare_lane(root, name, scope)?,
            None => Plan::prepare(root, name, scope)?,
        };
        let policy = policy::Policy::prepare(root, plan.pin())?;
        Ok(Self { plan, graph, policy })
    }

    fn validate(&mut self, root: &Path) -> io::Result<()> {
        if let Some(graph) = &mut self.graph {
            graph.validate()?;
        }
        if let Some(policy) = &self.policy {
            policy.validate(root)?;
        }
        Ok(())
    }
}

#[derive(Default)]
struct Parsed<'a> {
    name: Option<&'a str>,
    silent: bool,
    lane: bool,
    modifier: Option<(&'a str, &'a str)>,
}

impl<'a> Parsed<'a> {
    fn add(&mut self, arg: &'a str, rest: &mut impl Iterator<Item = &'a str>) -> Option<()> {
        match arg {
            "-s" | "--silent" if !self.silent => self.silent = true,
            "--lane" if !self.lane => self.lane = true,
            "--range" | "--snaps" if self.modifier.is_none() => {
                self.modifier = Some((arg, rest.next()?));
            }
            value if !value.starts_with('-') && self.name.is_none() => self.name = Some(value),
            _ => return None,
        }
        Some(())
    }
}

fn parse<'a>(args: &[&'a str]) -> Option<(&'a str, Scope, bool)> {
    let mut parsed = Parsed::default();
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        parsed.add(arg, &mut iter)?;
    }
    parsed.silent.then_some((parsed.name?, selection(parsed.modifier), parsed.lane))
}

fn selection(modifier: Option<(&str, &str)>) -> Scope {
    match modifier {
        Some(("--range", value)) => Scope::Range(value.to_owned()),
        Some(("--snaps", value)) => Scope::Snaps(
            value
                .split(',')
                .map(str::trim)
                .map(str::to_owned)
                .collect(),
        ),
        _ => Scope::Entire,
    }
}
