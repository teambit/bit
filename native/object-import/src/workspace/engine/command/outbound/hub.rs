//! [`resolve`] configured and hub scopes via [`resolution`], then retain the [`Plan`] via [`plan`].

pub(super) use resolution::{Resolution, global as configuration, resolve};

mod resolution;

use super::{Pending, Prepare, Retained, invalid};
use bit_client_transfer::{
    http::{HubReply, Network},
    remotes::symphony_url,
    tar,
};
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::{collections::HashSet, io};

/// Resolved central hub endpoint and cloud domain for an outbound export plan.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Plan {
    endpoint: String,
    cloud_domain: String,
}

pub(super) fn plan(input: &Prepare, pending: &[Pending]) -> io::Result<Option<Plan>> {
    if input.options.origin_directly
        || input.options.resume
            .as_deref()
            .is_some_and(|resume| !resume.trim().is_empty())
        || pending.is_empty()
    {
        return Ok(None);
    }
    let scopes = pending
        .iter()
        .map(|batch| resolve(input, &batch.scope))
        .collect::<io::Result<Vec<_>>>()?;
    let hub_count = scopes
        .iter()
        .filter(|remote| remote.hub)
        .count();
    if hub_count == 0 {
        return Ok(None);
    }
    if hub_count != pending.len() {
        return Err(io::Error::other(
            "some of your components are configured to be exported to a local scope and some to the bit.cloud hub. this is not supported",
        ));
    }
    let global = resolution::global(input)?;
    Ok(Some(Plan {
        endpoint: format!("{}/exporter", symphony_url(&global).trim_end_matches('/')),
        cloud_domain: global
            .get("cloud_domain")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|domain| !domain.is_empty())
            .unwrap_or("bit.cloud")
            .to_owned(),
    }))
}

pub(super) fn push(retained: &mut Retained) -> io::Result<Vec<String>> {
    execute(retained)
        .map_err(|error| {
            io::Error::new(
                error.kind(),
                format!(
                    "{error}\nthe following scopes were used for this export: {}",
                    retained.pending
                        .iter()
                        .map(|batch| batch.scope.as_str())
                        .collect::<Vec<_>>()
                        .join(", "),
                ),
            )
        })
}

fn execute(retained: &mut Retained) -> io::Result<Vec<String>> {
    let plan = retained.transfer.hub.as_ref().ok_or_else(|| invalid("outbound hub plan"))?;
    let reply = send(retained, plan)?;
    retained.transfer.messages = reply.messages;
    acknowledge(retained, &reply.data)
}

fn payload(pending: &[Pending]) -> io::Result<(Vec<u8>, String)> {
    let objects = scoped_objects(pending);
    let mut hash = Sha1::new();
    for object in &objects {
        hash.update(&object.compressed);
    }
    let digest: [u8; 20] = hash.finalize().into();
    Ok((tar::pack(&objects, tar::MAX_ARCHIVE_BYTES)?, crate::validate::hexadecimal(&digest)))
}

fn send(retained: &Retained, plan: &Plan) -> io::Result<HubReply> {
    let (archive, digest) = payload(&retained.pending)?;
    let network = Network::new(
        &retained.network.global,
        &retained.network.bit_version,
        None,
        retained.network.auth_token.as_deref(),
    )?;
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    runtime.block_on(network.push_central_observed(
        &plan.endpoint,
        archive,
        &digest,
        "export",
        |message| {
            let _ = crate::export_progress::emit(crate::export_progress::Event::HubMessage(
                message.to_owned(),
            ));
        },
    ))
}

fn acknowledge(retained: &mut Retained, data: &Value) -> io::Result<Vec<String>> {
    let failed = strings(&data["failedScopes"])?;
    if !failed.is_empty() {
        return Err(persist_failure(&failed, &data["errors"]));
    }
    let ids = strings(&data["successIds"])?;
    retained.transfer.jobs = if data["metadata"]["jobs"].is_null() {
        Vec::new()
    } else {
        strings(&data["metadata"]["jobs"])?
    };
    let plan = retained.transfer.hub.as_ref().ok_or_else(|| invalid("outbound hub plan"))?;
    let lane = retained.publication.as_ref().and_then(super::Publication::lane_name);
    retained.transfer.urls = retained.transfer.jobs
        .iter()
        .map(|job| job_url(&plan.cloud_domain, lane, job))
        .collect();
    Ok(ids)
}

#[inline]
fn job_url(domain: &str, lane: Option<&str>, job: &str) -> String {
    let domain = domain.trim().trim_end_matches('/');
    let job = job.trim().trim_start_matches('/');
    match lane
        .and_then(|raw| raw.trim().split_once('/'))
        .map(|(scope, name)| (scope.trim(), name.trim()))
        .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
    {
        Some((scope, name)) => format!(
            "https://{domain}/{}/~lane/{name}/~ripple-ci/job/{job}",
            scope.replacen('.', "/", 1),
        ),
        None => format!("https://{domain}/ripple-ci/job/{job}"),
    }
}

fn scoped_objects(pending: &[Pending]) -> Vec<tar::ObjectItem> {
    let total = pending
        .iter()
        .map(|batch| batch.objects.len())
        .sum::<usize>();
    let mut seen = HashSet::with_capacity(total);
    let mut objects = Vec::with_capacity(total);
    for batch in pending {
        let scope = batch.scope.trim();
        for object in &batch.objects {
            let hash = object.hash.trim().to_ascii_lowercase();
            if seen.insert((scope, hash.clone())) {
                objects.push(tar::ObjectItem {
                    scope: Some(scope.to_owned()),
                    hash,
                    compressed: object.compressed.clone(),
                });
            }
        }
    }
    objects
}

fn strings(value: &Value) -> io::Result<Vec<String>> {
    value
        .as_array()
        .ok_or_else(|| invalid("outbound hub acknowledgement array"))?
        .iter()
        .map(|value| {
            value
                .as_str()
                .map(str::trim)
                .filter(|identity| !identity.is_empty())
                .map(str::to_owned)
                .ok_or_else(|| invalid("outbound hub acknowledgement identity"))
        })
        .collect()
}

fn persist_failure(scopes: &[String], errors: &Value) -> io::Error {
    let details = errors
        .as_object()
        .into_iter()
        .flatten()
        .map(|(scope, message)| {
            format!("{} - {}", scope.trim(), message.as_str().map_or("", str::trim))
        })
        .collect::<Vec<_>>()
        .join("\n");
    io::Error::other(format!(
        "failed persisting to the following scopes: {}\nerrors:\n{details}\n\nthe remote bit.dev will try to re-persist the data for the failed scopes.\n   ",
        scopes.join(", "),
    ))
}
