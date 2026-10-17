//! Canonical component and lane abort reports.
use super::{
    Chalk, Formatter, Id, Kind, Report, Value, array, checkout, decline, io, object, text,
};

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

#[cfg_attr(
    dylint_lib = "perfectionist",
    expect(
        perfectionist::too_many_local_bindings,
        reason = "Existing CLI orchestration is retained until its operation is decomposed"
    )
)]
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
    let format = Formatter::new(chalk);
    let restored = items
        .iter()
        .map(|item| text(Some(item)).map(|item| format.item(item)))
        .collect::<io::Result<Vec<_>>>()?;
    let summary = format!(
        "{}\n{}",
        format.success_summary("The following have been restored successfully"),
        restored.join("\n"),
    );
    let checkout = match map
        .get("checkoutResults")
        .filter(|value| !value.is_null())
    {
        Some(result) => {
            let options = checkout::options::parse(&["reset", "--all", "-x"])
                .ok_or_else(|| decline("recovery checkout options"))?;
            checkout::report::format(result, &options, chalk)?
        }
        None => Report { data: String::new(), code: 0, details: None },
    };
    let error = map.get("checkoutError").filter(|value| !value.is_null())
        .map(|value| text(value.get("message")))
        .transpose()?
        .map(|message| chalk.red(&format!("\n\nFailed to change component files to the pre-merge state due to an error:\n{message}\nplease fix the error and then run \"bit checkout reset --all\" to revert the components to the pre-merge state")))
        .unwrap_or_default();
    Ok(Report {
        data: Formatter::join(&[checkout.data, summary.clone(), error.clone()]),
        code: checkout.code,
        details: checkout.details.map(|details| Formatter::join(&[details, summary, error])),
    })
}
