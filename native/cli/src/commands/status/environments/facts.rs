//! Raw registered environment policies and callback facts.

use super::{EnvJsoncReader, Host, Value, WorkspaceComponent, io, json};

pub(super) fn read(
    host: &Host,
    reader: &EnvJsoncReader<'_>,
    component: &WorkspaceComponent,
    core: &[String],
    aspects: &[String],
    needs_issues: bool,
) -> io::Result<Value> {
    let configured = component.config
        .keys()
        .filter(|id| {
            let bare = bit_install::policy::split_version(id).0;
            !(core.contains(id)
                || core.iter().any(|item| item == bare)
                || bit_install::policy::is_core_env(id))
        })
        .collect::<Vec<_>>();
    let registrations = if configured.is_empty() {
        json!([])
    } else {
        host.call("dependencyPolicies", &json!({"extensionIds":configured}))?
    };
    let (env_id, multiple) = selected_env(host, reader, component)?;
    validate_selected_env(&env_id)?;
    let manifest = reader.resolved(&env_id)?;
    let provider = provider_facts(host, &env_id, manifest.as_ref(), needs_issues)?;
    Ok(json!({"envId":env_id,"envPolicy":provider.env_policy,
        "compiler":provider.compiler,"nonLoaded":provider.dev_patterns.is_null(),"devPatterns":provider.dev_patterns,"multiple":multiple,
        "manifestPatterns":manifest.as_ref().and_then(|manifest|manifest.get("patterns")),
        "registeredEnvPolicy":registered(component,&registrations),"aspectIds":aspects,
        "envOwnPolicy":own_policy(reader,component,host,aspects)?,
        "loadFailures":provider.load_failures,
    }))
}

struct ProviderFacts {
    env_policy: Value,
    dev_patterns: Value,
    compiler: Value,
    load_failures: Value,
}

fn provider_facts(
    host: &Host,
    env_id: &str,
    manifest: Option<&Value>,
    needs_issues: bool,
) -> io::Result<ProviderFacts> {
    let provider = host.call(
        "providerFacts",
        &json!({"envId":env_id,"needsEnvPolicy":manifest.is_none(),"needsIssues":needs_issues}),
    )?;
    let env_policy = match manifest {
        Some(manifest) => manifest
            .get("policy")
            .cloned()
            .unwrap_or_else(|| json!({})),
        None => provider_fact(&provider, "envPolicy")?,
    };
    let dev_patterns = provider_fact(&provider, "devPatterns")?;
    let compiler = if needs_issues { provider_fact(&provider, "compiler")? } else { Value::Null };
    let load_failures = provider
        .get("loadFailures")
        .cloned()
        .unwrap_or_else(|| json!([]));
    Ok(ProviderFacts {
        env_policy: if env_policy.is_null() { json!({}) } else { env_policy },
        dev_patterns,
        compiler,
        load_failures,
    })
}

fn provider_fact(provider: &Value, name: &str) -> io::Result<Value> {
    provider
        .get(name)
        .cloned()
        .ok_or_else(|| io::Error::other(format!("provider facts omitted {name}")))
}

fn validate_selected_env(env_id: &str) -> io::Result<()> {
    if env_id.trim().is_empty() {
        return Err(io::Error::other("selected environment id is empty"));
    }
    Ok(())
}

fn selected_env(
    host: &Host,
    reader: &EnvJsoncReader<'_>,
    component: &WorkspaceComponent,
) -> io::Result<(String, Value)> {
    let envs =
        host.call("environmentIds", &json!({"ids":component.config.keys().collect::<Vec<_>>()}))?;
    let explicit = component.config
        .get("teambit.envs/envs")
        .or_else(|| {
            component.config
                .iter()
                .find_map(|(key, val)| {
                    (bit_install::policy::split_version(key).0 == "teambit.envs/envs").then_some(
                        val,
                    )
                })
        })
        .and_then(|config| config["env"].as_str())
        .map(str::trim)
        .filter(|env| !env.is_empty());
    let selected = explicit
        .map_or_else(
            || {
                envs.get(0)
                    .and_then(Value::as_str)
                    .or_else(|| non_loaded_workspace_env(reader, component))
                    .unwrap_or(&component.env_id)
            },
            |env| {
                component.config
                    .keys()
                    .find(|id| {
                        bit_install::policy::split_version(id).0
                            == bit_install::policy::split_version(env).0
                    })
                    .map_or(env, String::as_str)
            },
        )
        .to_owned();
    Ok((selected, if explicit.is_some() { json!([]) } else { envs }))
}

fn non_loaded_workspace_env<'a>(
    reader: &EnvJsoncReader<'_>,
    component: &'a WorkspaceComponent,
) -> Option<&'a str> {
    if bit_install::policy::split_version(&component.env_id).0 != "teambit.harmony/node" {
        return None;
    }
    component.config
        .keys()
        .find(|id| {
            let base = bit_install::policy::split_version(id).0;
            reader.components
                .iter()
                .any(|other| {
                    other.id.to_string_without_version() == base
                        && (other.is_env
                            || bit_install::policy::split_version(&other.env_id).0
                                == "teambit.envs/env"
                            || other.config
                                .keys()
                                .any(|key| {
                                    bit_install::policy::split_version(key).0 == "teambit.envs/env"
                                }))
                        && !other.dir.join("dist").exists()
                })
        })
        .map(String::as_str)
}

fn registered(component: &WorkspaceComponent, registrations: &Value) -> Vec<Value> {
    component.config
        .keys()
        .filter_map(|id| {
            registrations
                .as_array()?
                .iter()
                .find(|entry| {
                    entry[0]
                        .as_str()
                        .is_some_and(|registrar| registrar == id || registrar.contains(id.as_str()))
                })
                .map(|entry| entry[1].clone())
        })
        .collect()
}

fn own_policy(
    reader: &EnvJsoncReader<'_>,
    component: &WorkspaceComponent,
    host: &Host,
    aspects: &[String],
) -> io::Result<Value> {
    if !component.is_env
        && bit_install::policy::split_version(&component.env_id).0 != "teambit.envs/env"
    {
        return Ok(json!({}));
    }
    let policy = if let Some(manifest) = reader.resolved(&component.id.to_string_without_version())?
    {
        bit_install::policy::env::from_config(&manifest["policy"], false)?
    } else {
        let raw = host.call(
            "registeredEnvPolicy",
            &json!({"envId":component.id.to_string_without_version(),"aspectIds":aspects}),
        )?;
        bit_install::policy::env::from_config(&raw, true)?
    };
    let dependencies = policy.self_policy
        .into_iter()
        .map(|entry| (entry.name, json!(entry.version)))
        .collect::<serde_json::Map<_, _>>();
    Ok(json!({"dependencies":dependencies}))
}
