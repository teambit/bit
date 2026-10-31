//! Native lane history ownership spans both checkout partitions and their callbacks.
use super::{installation, options::Options, report};
use crate::commands::{
    color::Chalk,
    engine::Engine,
    installation::Installer,
    status::{
        autosync::Startup,
        cache::cache_root,
        environments::{self, Environments},
    },
    workspace_command::{self, NodeCli, Planned, Request, progress::Progress, results::Report},
};
use bit_install::{HostInfo, output::Output};
use serde_json::{Value, json};
use std::{ffi::OsString, io, path::Path};

pub(super) struct Session {
    engine: Option<Engine>,
    environment: Option<Environments>,
    installation: Option<HostInfo>,
    selection: Value,
    first: Option<Planned>,
}

impl Session {
    pub fn start(
        root: &Path,
        argv: &[&str],
        options: &Options,
        startup: &mut Startup,
    ) -> io::Result<Self> {
        let cli = NodeCli::find()?;
        let mut engine = Engine::new()?;
        let (environment, installation) = bootstrap(root, argv, options, startup, &mut engine)?;
        startup.stdout.push_str(&environment.take_tracking_stdout());
        let selection = select(root, options, &cli, &mut engine, startup)?;
        let mut session = Self {
            engine: Some(engine),
            environment: Some(environment),
            installation,
            selection,
            first: None,
        };
        let phases = session.phases()?;
        session.first = Some(session.prepare_phase(root, &phases[0], startup)?);
        Ok(session)
    }

    pub fn run(
        mut self,
        root: &Path,
        args: &[OsString],
        options: &Options,
        mut startup: Startup,
        output: &Output,
    ) -> io::Result<Report> {
        let phases = self.phases()?;
        let mut result = None;
        for (index, phase) in phases.iter().enumerate() {
            let current = self.phase(root, phase, &mut startup, output)?;
            if index == 0 {
                result = Some(current);
            } else {
                report::merge(
                    result.as_mut().ok_or_else(|| io::Error::other("lane history first result"))?,
                    &current,
                )?;
            }
            startup = Startup { committed: true, ..Startup::default() };
        }
        report::render(
            &result.ok_or_else(|| io::Error::other("lane history result"))?,
            options,
            Chalk::detect(args),
        )
    }

    fn phases(&self) -> io::Result<Vec<Value>> {
        if self.selection["historyToken"]
            .as_str()
            .is_none_or(|token| token.trim().is_empty())
        {
            return Err(io::Error::other("lane history token"));
        }
        let phases = self.selection["phases"]
            .as_array()
            .filter(|phases| {
                !phases.is_empty()
                    && phases.len() <= 2
                    && phases
                        .iter()
                        .all(|phase| {
                            phase["phase"]
                                .as_str()
                                .is_some_and(|name| !name.trim().is_empty())
                                && phase["revert"].is_boolean()
                        })
            })
            .ok_or_else(|| io::Error::other("lane history phases"))?;
        Ok(phases.clone())
    }

    fn prepare_phase(
        &mut self,
        root: &Path,
        phase: &Value,
        startup: &mut Startup,
    ) -> io::Result<Planned> {
        let request = self.phase_request(phase);
        let engine = self.engine.take().ok_or_else(|| io::Error::other("lane history engine"))?;
        workspace_command::plan_retained(root, &request, startup, self.environment.take(), engine)
    }

    fn phase_request(&self, phase: &Value) -> Request<'static> {
        Request {
            operation: "checkout",
            to: None,
            verify_fresh: false,
            options: json!({"laneHistory":{"token":self.selection["historyToken"],"phase":phase["phase"]},
                "to":null,"pattern":null,"all":false,"revert":phase["revert"],"skipDependencyInstallation":true}),
        }
    }

    fn phase(
        &mut self,
        root: &Path,
        phase: &Value,
        startup: &mut Startup,
        output: &Output,
    ) -> io::Result<Value> {
        let mut planned = match self.first.take() {
            Some(planned) => planned,
            None => self
                .prepare_phase(root, phase, startup)
                .map_err(|error| match render_failure(startup, output, &error) {
                    Ok(()) => error,
                    Err(receipt_error) => receipt_error,
                })?,
        };
        if let Some(progress) = Progress::parse(planned.plan.get("progress"))? {
            progress.render_lane_history(output);
        }
        workspace_command::checkout_lifecycle::loaded(startup);
        workspace_command::commit(&mut planned, root)?;
        let mut result = planned.plan["result"].clone();
        self.environment = match &self.installation {
            Some(info) => installation::run(root, &mut planned, info.clone(), &mut result, output)?,
            None => planned.take_environment(),
        };
        self.engine = Some(planned.into_engine());
        Ok(result)
    }
}

fn select(
    root: &Path,
    options: &Options,
    cli: &NodeCli,
    engine: &mut Engine,
    startup: &mut Startup,
) -> io::Result<Value> {
    let config = cache_root().join("config");
    let selection: Value = engine.request(&json!({
            "kind":"commandLaneHistoryPrepare","root":root,"home":workspace_command::home(),
            "globalRemotesFile":config.join("global-remotes.json"),
            "globalConfigDir":config,"nodeExecutable":cli.node,"bitDir":cli.bit_dir,"bitVersion":cli.version,
            "id":options.id.trim(),"revert":options.revert,"restoreDeleted":options.restore_deleted,
        })).inspect_err(|error| {
            if let Some(progress)=crate::commands::engine::canonical_progress(error)
                && progress["bitmapCount"].is_u64() {
                startup.build_progress=Some(progress.clone());
            }
        })?;
    startup.committed |= selection["committed"] == true;
    Ok(selection)
}

fn bootstrap(
    root: &Path,
    argv: &[&str],
    options: &Options,
    startup: &mut Startup,
    engine: &mut Engine,
) -> io::Result<(Environments, Option<HostInfo>)> {
    let home = workspace_command::home();
    if options.skip_install {
        let (_, environment) =
            environments::read_context(engine, root, &home, false, None, startup)?;
        return Ok((environment.for_checkout(), None));
    }
    let (environment, info) = Installer::start(root, argv)?.into_parts()?;
    let (_, environment) =
        environments::read_inherited_context(engine, root, &home, None, startup, environment)?;
    Ok((environment.for_checkout(), Some(info)))
}

pub(super) fn render_failure(
    startup: &Startup,
    output: &Output,
    error: &io::Error,
) -> io::Result<()> {
    if let Some(progress) = Progress::parse(startup.build_progress.as_ref())? {
        progress.render_lane_history(output);
    }
    if let Some(progress) = &startup.build_progress {
        Progress::render_history_pending(output, progress.get("historyCheckoutImport"))?;
    }
    workspace_command::checkout_lifecycle::loaded(startup);
    if let Some(callback) = error
        .get_ref()
        .and_then(|error| error.downcast_ref::<crate::host::callback_error::CallbackError>())
    {
        print!("{}{}", callback.startup, callback.output);
    }
    Ok(())
}
