//! Canonical component and lane abort reports and preparation helpers.
use super::{
    Chalk, Engine, Formatter, HostInfo, Id, Installer, Kind, Options, Path, Report, Startup, Value,
    array, cache, checkout, decline, dependency_grammar, environments, installation, io, json,
    object, text, workspace_command,
};

pub(super) fn install_ids(result: &Value, kind: Kind) -> io::Result<Vec<String>> {
    if kind == Kind::Lane {
        return installation::component_ids(&result["checkoutResults"]);
    }
    let rows = array(result.get("abortedComponents"), "aborted components")?;
    let mut ids = rows
        .iter()
        .map(|row| Id::parse(text(row.get("id"))?).map(|id| id.display()))
        .collect::<io::Result<Vec<_>>>()?;
    ids.sort();
    ids.dedup();
    Ok(ids)
}

pub(super) fn format_result(result: &Value, kind: Kind, chalk: Chalk) -> io::Result<Report> {
    if kind == Kind::Lane { format_lane(result, chalk) } else { format_component(result, chalk) }
}

pub(super) fn format_component(result: &Value, chalk: Chalk) -> io::Result<Report> {
    let map = object(result)?;
    let rows = array(map.get("abortedComponents"), "aborted components")?;
    if map
        .keys()
        .any(|key| key != "abortedComponents")
        || rows.len() > 4096
    {
        return Err(decline("merge abort result"));
    }
    let format = Formatter::new(chalk);
    let items = rows
        .iter()
        .map(|row| Id::parse(text(row.get("id"))?).map(|id| format.item(&id.without_version())))
        .collect::<io::Result<Vec<_>>>()?;
    Ok(Report { data: format.section("merge aborted", "", &items), code: 0, details: None })
}

fn format_lane(result: &Value, chalk: Chalk) -> io::Result<Report> {
    let map = object(result)?;
    let items = array(map.get("restoredItems"), "restored items")?;
    if map
        .keys()
        .any(|key| !matches!(key.as_str(), "checkoutResults" | "restoredItems" | "checkoutError"))
        || items.len() > 4096
    {
        return Err(decline("lane recovery result"));
    }
    let summary = lane_restored_summary(items, &Formatter::new(chalk))?;
    let checkout = lane_checkout_report(map, chalk)?;
    let error = lane_checkout_error(map, chalk)?;
    Ok(Report {
        data: Formatter::join(&[checkout.data, summary.clone(), error.clone()]),
        code: checkout.code,
        details: checkout.details.map(|details| Formatter::join(&[details, summary, error])),
    })
}

fn lane_restored_summary(items: &[Value], format: &Formatter) -> io::Result<String> {
    let restored = items
        .iter()
        .map(|item| text(Some(item)).map(|item| format.item(item)))
        .collect::<io::Result<Vec<_>>>()?;
    Ok(format!(
        "{}\n{}",
        format.success_summary("The following have been restored successfully"),
        restored.join("\n"),
    ))
}

fn lane_checkout_report(map: &serde_json::Map<String, Value>, chalk: Chalk) -> io::Result<Report> {
    match map
        .get("checkoutResults")
        .filter(|value| !value.is_null())
    {
        Some(result) => {
            let options = checkout::options::parse(&["reset", "--all", "-x"])
                .ok_or_else(|| decline("recovery checkout options"))?;
            checkout::report::format(result, &options, chalk)
        }
        None => Ok(Report { data: String::new(), code: 0, details: None }),
    }
}

fn lane_checkout_error(map: &serde_json::Map<String, Value>, chalk: Chalk) -> io::Result<String> {
    let message = map
        .get("checkoutError")
        .filter(|value| !value.is_null())
        .map(|value| text(value.get("message")))
        .transpose()?;
    Ok(message
        .map(|msg| chalk.red(&format!("\n\nFailed to change component files to the pre-merge state due to an error:\n{msg}\nplease fix the error and then run \"bit checkout reset --all\" to revert the components to the pre-merge state")))
        .unwrap_or_default())
}

pub(super) fn consume_trailing_recovery<'a>(
    iter: impl Iterator<Item = &'a str>,
    kind: Kind,
    pattern: &mut Option<String>,
) -> Option<()> {
    for value in iter {
        (kind == Kind::Component && pattern.is_none() && valid_pattern(value)).then_some(())?;
        *pattern = Some(value.to_string());
    }
    Some(())
}

pub(super) fn valid_pattern(pattern: &str) -> bool {
    !pattern.is_empty()
        && pattern.len() <= 256
        && !pattern.starts_with('-')
        && pattern
            .bytes()
            .all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"_./-".contains(&byte)
            })
}

pub(super) fn installation_session(
    installer: Option<Installer>,
) -> io::Result<(Option<environments::Environments>, Option<HostInfo>)> {
    let Some(installer) = installer else { return Ok((None, None)) };
    let (environment, info) = installer.into_parts()?;
    Ok((Some(environment), Some(info)))
}

pub(super) fn read_environment(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    startup: &mut Startup,
    inherited: Option<environments::Environments>,
) -> io::Result<environments::Environments> {
    let (_, environment) = match inherited {
        Some(env_state) => {
            environments::read_inherited_context(engine, root, home, None, startup, env_state)?
        }
        None => environments::read_context(engine, root, home, false, None, startup)?,
    };
    Ok(environment.for_checkout())
}

pub(super) fn prepare_request(root: &Path, home: &Path, options: &Options) -> io::Result<Value> {
    let operation = if options.kind == Kind::Lane { "laneAbort" } else { "componentAbort" };
    let mut request = json!({
        "kind":"commandRecoveryPrepare","root":root,"home":home,
        "globalRemotesFile":cache::cache_root().join("config/global-remotes.json"),
        "operation":operation,"dependencyGrammar":dependency_grammar()?,
        "options":{"silent":options.kind==Kind::Lane,"verbose":options.verbose,
            "skipDependencyInstallation":true,"callbackLifecycle":true},
    });
    if let Some(pattern) = &options.pattern {
        request["options"]["pattern"] = json!(pattern);
    }
    Ok(request)
}

pub(super) fn prepare_recovery_context(
    engine: &mut Engine,
    request: &Value,
    options: &Options,
    startup: &mut Startup,
) -> io::Result<(String, Value, Vec<Value>)> {
    let prepared: Value = engine.request(request)?;
    let token = text(prepared.get("token"))?.to_string();
    let mut context = prepared
        .get("context")
        .filter(|value| value.is_object())
        .ok_or_else(|| decline("recovery context"))?
        .clone();
    let targets = array(prepared.get("captureTargets"), "recovery capture targets")?.to_vec();
    if targets.len() > 4096 {
        return Err(decline("recovery target limit"));
    }
    if options.kind == Kind::Lane {
        startup.committed = true;
        let file_id = workspace_command::file_id();
        let _: Value = engine.request(
            &json!({"kind":"commandRecoveryRestore","token":token,"fileId":file_id}),
        )?;
        context["recoveryRestoredFileId"] = json!(file_id);
    }
    Ok((token, context, targets))
}
