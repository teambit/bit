//! Native local untracking for a clean, new component.

use super::{
    color::Chalk,
    status,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{commands::Command, native::Outcome, workspace};
use bit_object_import::component_remove::{Plan, VersionedPlan};
use std::{env, ffi::OsString, fmt::Write, io};

pub const COMMAND: Command = Command { name: "remove", aliases: &["rm"], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".into()));
    };
    let Some((name, keep_files, force)) = parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native remove grammar".into()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    let plan = match prepare(&root, name, keep_files, force) {
        Ok(plan) => plan,
        Err(error) => return Ok(Outcome::Declined(format!("remove: {error}"))),
    };
    let format = Formatter::new(Chalk::detect(args));
    let report = Report { data: report_data(&format, &plan)?, code: 0, details: None };
    let file_id = workspace_command::file_id();
    workspace_command::execute_with(&root, args, "remove", &report, |output| {
        for status in ["removing components", "removing components", "loading 1 component(s)"] {
            output.status(status);
        }
        if plan.second_load() {
            output.status("loading 1 component(s)");
        }
        plan.commit(&file_id)
    })
}

fn report_data(format: &Formatter, plan: &Removal) -> io::Result<String> {
    let mut data = format!(
        "{}\n{}",
        format.success_summary("successfully removed components from the local workspace"),
        format.item(plan.identity()),
    );
    if plan.removed_from_lane() {
        write!(
            data,
            "\n\n{}\n{}",
            format.success_summary("successfully removed components from the local lane"),
            format.item(plan.identity()),
        )
        .map_err(io::Error::other)?;
    }
    Ok(data)
}

fn prepare(
    root: &std::path::Path,
    name: &str,
    keep_files: bool,
    force: bool,
) -> io::Result<Removal> {
    if force {
        return VersionedPlan::prepare(root, name, keep_files)
            .or_else(|_| VersionedPlan::prepare_imported(root, name, keep_files))
            .or_else(|_| VersionedPlan::prepare_lane_snap(root, name, keep_files, false))
            .map(|plan| Removal::Versioned(Box::new(plan)));
    }
    if let Ok(plan) = Plan::prepare(root, name, keep_files) {
        return Ok(Removal::New(Box::new(plan)));
    }
    if let Ok(plan) = VersionedPlan::prepare(root, name, keep_files) {
        if status::clean_staged_component(root, plan.identity())? {
            return Ok(Removal::Versioned(Box::new(plan)));
        }
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "tagged component is not clean and staged",
        ));
    }
    if let Ok(plan) = VersionedPlan::prepare_imported(root, name, keep_files) {
        if !status::clean_imported_component(root, plan.identity())? {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "imported component is modified",
            ));
        }
        return Ok(Removal::Versioned(Box::new(plan)));
    }
    let plan = VersionedPlan::prepare_lane_snap(root, name, keep_files, true)?;
    if !status::clean_staged_component(root, plan.identity())? {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "lane component is modified"));
    }
    Ok(Removal::Versioned(Box::new(plan)))
}

enum Removal {
    New(Box<Plan>),
    Versioned(Box<VersionedPlan>),
}

impl Removal {
    fn identity(&self) -> &str {
        match self {
            Self::New(plan) => plan.identity(),
            Self::Versioned(plan) => plan.identity(),
        }
    }

    fn second_load(&self) -> bool {
        matches!(self, Self::New(plan) if plan.main_exists())
    }

    fn removed_from_lane(&self) -> bool {
        matches!(self, Self::Versioned(plan) if plan.removed_from_lane())
    }

    fn commit(&self, file_id: &str) -> io::Result<()> {
        match self {
            Self::New(plan) => plan.commit(file_id),
            Self::Versioned(plan) => plan.commit(file_id),
        }
    }
}

fn parse<'a>(args: &[&'a str]) -> Option<(&'a str, bool, bool)> {
    let mut name = None;
    let mut silent = false;
    let mut keep_files = false;
    let mut force = false;
    for arg in args {
        match *arg {
            "-s" | "--silent" if !silent => silent = true,
            "--keep-files" if !keep_files => keep_files = true,
            "-f" | "--force" if !force => force = true,
            value if !value.starts_with('-') && name.is_none() => name = Some(value),
            _ => return None,
        }
    }
    silent.then_some((name?, keep_files, force))
}
