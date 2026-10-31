mod ownership;
mod usage;
use super::{Options, Plan, error, files, identity, main_file, rows};
use serde_json::{Value, json};
use std::{collections::HashSet, io};

struct Candidate {
    name: String,
    generated: bool,
    directory: String,
    files: Vec<String>,
    scope: String,
}
pub(super) fn prepare(
    plan: &mut Plan,
    directories: &[String],
    options: &Options,
    facts: &Value,
) -> io::Result<()> {
    let mut candidates = Vec::new();
    for directory in directories {
        let (name, generated, existing_scope) =
            identity::choose(&plan.root, directory, options, &plan.bitmap)?;
        let scope = initial_scope(facts, directory, &name, options, generated, existing_scope)?;
        ownership::validate(plan, directory, &name, &scope)?;
        let files = match files::read(plan, directory, directories, facts) {
            Ok(files) => files,
            Err(error)
                if directories.len() > 1 && error.to_string().starts_with(r#"directory ""#) =>
            {
                plan.warnings["emptyDirectory"]
                    .as_array_mut()
                    .unwrap()
                    .push(json!(directory));
                continue;
            }
            Err(error) => return Err(error),
        };
        candidates.push(Candidate { name, generated, directory: directory.clone(), files, scope });
    }
    shorten(&mut candidates, &plan.bitmap, options, facts)?;
    for candidate in &mut candidates {
        if candidate.scope.is_empty() {
            candidate.scope =
                identity::scope(facts, &candidate.directory, &candidate.name, options)?;
        }
    }
    duplicates(&candidates)?;
    for candidate in candidates {
        apply(plan, candidate, options, facts)?;
    }
    Ok(())
}
fn initial_scope(
    facts: &Value,
    directory: &str,
    name: &str,
    options: &Options,
    generated: bool,
    existing: Option<String>,
) -> io::Result<String> {
    let existing = existing
        .map(|scope| scope.trim().to_owned())
        .filter(|scope| !scope.is_empty());
    let result = existing.map_or_else(|| identity::scope(facts, directory, name, options), Ok);
    match result {
        Err(error)
            if generated
                && error.kind() == io::ErrorKind::Unsupported
                && identity::vendor(&facts["workspace"], directory) =>
        {
            Ok(String::new())
        }
        other => other,
    }
}

fn shorten(
    candidates: &mut [Candidate],
    bitmap: &Value,
    options: &Options,
    facts: &Value,
) -> io::Result<()> {
    let generated = candidates
        .iter()
        .filter(|row| row.generated)
        .map(|row| {
            row.name
                .rsplit('/')
                .next()
                .unwrap()
                .to_owned()
        })
        .collect::<Vec<_>>();
    for candidate in candidates {
        if !candidate.generated {
            continue;
        }
        let name = candidate.name
            .rsplit('/')
            .next()
            .unwrap();
        let existing = bitmap
            .as_object()
            .is_some_and(|rows| {
                rows.iter()
                    .any(|(key, row)| rows::row_name(key, row) == Some(name))
            });
        if !existing
            && generated
                .iter()
                .filter(|other| other.as_str() == name)
                .count()
                == 1
        {
            candidate.name = name.into();
            candidate.scope =
                identity::scope(facts, &candidate.directory, &candidate.name, options)?;
        }
    }
    Ok(())
}
fn duplicates(candidates: &[Candidate]) -> io::Result<()> {
    let mut seen = HashSet::new();
    for candidate in candidates {
        if !seen.insert(&candidate.name) {
            return Err(error(format!(
                "unable to add {} components with the same ID: {}/{} : {}\n",
                candidate.files.len(),
                candidate.scope,
                candidate.name,
                candidate.files.join(","),
            )));
        }
    }
    Ok(())
}

fn apply(
    plan: &mut Plan,
    mut candidate: Candidate,
    options: &Options,
    facts: &Value,
) -> io::Result<()> {
    let existing = rows::find(&plan.bitmap, &candidate.name, Some(&candidate.scope))?.cloned();
    out_of_sync(plan, &candidate, existing.as_ref(), facts)?;
    let existing = rows::find(&plan.bitmap, &candidate.name, Some(&candidate.scope))?.cloned();
    usage::filter(plan, &mut candidate, existing.as_ref())?;
    let version = existing
        .as_ref()
        .and_then(|row| row["version"].as_str())
        .unwrap_or_default();
    let id = identity::id(&candidate.name, &candidate.scope, version);
    if candidate.files.is_empty() {
        plan.components.push(json!({"id":id,"identity":id,"files":[]}));
        return Ok(());
    }
    let relative = relative_files(&candidate.directory, &candidate.files);
    let main = resolve_main(plan, &candidate, options, &id, existing.as_ref(), &relative)?;
    let row = bitmap_row(&candidate, &main, existing.as_ref(), options);
    let scope = row["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .or_else(|| row["defaultScope"].as_str())
        .unwrap_or(&candidate.scope);
    let id = identity::id(&candidate.name, scope, row["version"].as_str().unwrap_or_default());
    plan.components.push(json!({"id":id,"identity":format!("{scope}/{}",candidate.name),"rootDir":candidate.directory,"mainFile":main,"defaultScope":scope,"files":sorted(relative),"version":row["version"],"loadVersion":load_version(existing.as_ref(),options),"config":row.get("config").cloned().unwrap_or(json!({}))}));
    rows::publish(&mut plan.bitmap, row)?;
    plan.dirty = true;
    Ok(())
}
fn load_version(existing: Option<&Value>, options: &Options) -> Value {
    if let Some(row) = existing {
        return json!(
            row["version"]
                .as_str()
                .map(str::trim)
                .filter(|version| !version.is_empty())
                .unwrap_or("latest")
        );
    }
    if options.id
        .as_deref()
        .is_some_and(|id| !id.trim().is_empty())
    {
        json!("latest")
    } else {
        Value::Null
    }
}

fn resolve_main(
    plan: &Plan,
    candidate: &Candidate,
    options: &Options,
    id: &str,
    existing: Option<&Value>,
    relative: &[String],
) -> io::Result<String> {
    let explicit =
        main_file::resolve(&plan.root, &plan.cwd, options.main.as_deref(), &candidate.files)?;
    if let Some(explicit) = &explicit
        && plan.root.join(explicit).is_file()
        && !candidate.files
            .iter()
            .any(|file| file.eq_ignore_ascii_case(explicit))
    {
        return Err(error(format!(
            "error: main file {} was excluded from file list",
            explicit
                .strip_prefix(&format!("{}/", candidate.directory))
                .unwrap_or(explicit),
        )));
    }
    main_file::choose(
        id,
        &candidate.directory,
        relative,
        explicit.as_deref(),
        existing_main(existing, &candidate.directory, relative).as_deref(),
    )
}

fn existing_main(existing: Option<&Value>, directory: &str, files: &[String]) -> Option<String> {
    let existing = existing?;
    let main = existing["mainFile"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())?;
    let root = existing["rootDir"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .unwrap_or(directory);
    let main = if root == directory {
        main.into()
    } else {
        format!(
            "{}/{}",
            root.strip_prefix(&format!("{directory}/"))
                .unwrap_or(root),
            main,
        )
    };
    Some(
        files
            .iter()
            .find(|file| file.eq_ignore_ascii_case(&main))
            .cloned()
            .unwrap_or(main),
    )
}

fn bitmap_row(
    candidate: &Candidate,
    main: &str,
    existing: Option<&Value>,
    options: &Options,
) -> Value {
    let mut row = existing.cloned().unwrap_or_else(
        || json!({"name":candidate.name,"scope":"","version":"","defaultScope":candidate.scope}),
    );
    row["name"] = json!(candidate.name);
    row["mainFile"] = json!(main);
    row["rootDir"] = json!(candidate.directory);
    let config = if candidate.directory == "." {
        identity::root_config(existing.and_then(|row| row.get("config")), options)
    } else {
        options.config.clone()
    };
    if config
        .as_object()
        .is_some_and(|config| !config.is_empty())
    {
        row["config"] = config;
    }
    row
}
fn out_of_sync(
    plan: &mut Plan,
    candidate: &Candidate,
    existing: Option<&Value>,
    facts: &Value,
) -> io::Result<()> {
    if existing.is_some() {
        return Ok(());
    }
    if let Some(model) = identity::model(facts, &candidate.name, &candidate.scope) {
        let version = latest_semantic(&model);
        if let Some(version) = version {
            rows::publish(
                &mut plan.bitmap,
                json!({"name":candidate.name,"scope":candidate.scope,"version":version}),
            )?;
            plan.warnings["existInScope"]
                .as_array_mut()
                .unwrap()
                .push(json!(identity::id(&candidate.name, &candidate.scope, &version)));
        }
    }
    Ok(())
}
fn latest_semantic(model: &Value) -> Option<String> {
    model["versions"]
        .as_object()
        .into_iter()
        .chain(model["orphanedVersions"].as_object())
        .flat_map(serde_json::Map::keys)
        .filter_map(|version| {
            node_semver::Version::parse(version)
                .ok()
                .map(|parsed| (parsed, version))
        })
        .max_by(|left, right| left.0.cmp(&right.0))
        .map(|(_, version)| version.clone())
}

fn relative_files(directory: &str, files: &[String]) -> Vec<String> {
    files
        .iter()
        .map(|file| {
            file.strip_prefix(&format!("{directory}/"))
                .unwrap_or(file)
                .to_owned()
        })
        .collect()
}
fn sorted(mut files: Vec<String>) -> Vec<String> {
    files.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
    files
}
