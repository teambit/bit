//! `bit ws-config write` config file generation for standard environments.

use super::{
    WriteOptions,
    clean::{find_configs_to_clean, writer_matches},
    format::{
        EnvsWrittenRealConfigFile, OneConfigWriterIdResult, WriteConfigFilesResult, WriteResults,
        WrittenConfigFile, WrittenExtendingConfigFile, finish_one_writer, strip_dry_run_contents,
        summarize_writers,
    },
};
use bit_install::policy::scope::hex_sha1;
use serde_json::json;
use std::{fs, io, path::Path};

const TS_RAW_HASH: &str = "8a8e26913a6191740f6dc8052f5cd46e8179d403";
const ASSET_DTS_HASH: &str = "567ee21978cbce56ebd1a166885c6d74665e7d8f";
const STYLE_DTS_HASH: &str = "b31200bf25de0be451df15ad5c78e4e81a227cae";
const PRETTIER_HASH: &str = "e4882af8861bcf5b0147891d8b70b40a10428881";

const ASSET_DTS_CONTENT: &str = "declare module '*.png' {\n  const value: any;\n  export = value;\n}\ndeclare module '*.svg' {\n  import type { FunctionComponent, SVGProps } from 'react';\n\n  export const ReactComponent: FunctionComponent<\n    SVGProps<SVGSVGElement> & { title?: string }\n  >;\n  const src: string;\n  export default src;\n}\n\n// @TODO Gilad\ndeclare module '*.jpg' {\n  const value: any;\n  export = value;\n}\ndeclare module '*.jpeg' {\n  const value: any;\n  export = value;\n}\ndeclare module '*.gif' {\n  const value: any;\n  export = value;\n}\ndeclare module '*.bmp' {\n  const value: any;\n  export = value;\n}\ndeclare module '*.otf' {\n  const value: any;\n  export = value;\n}\ndeclare module '*.woff' {\n  const value: any;\n  export = value;\n}\ndeclare module '*.woff2' {\n  const value: any;\n  export = value;\n}\n";

const STYLE_DTS_CONTENT: &str = "declare module '*.module.css' {\n  const classes: { readonly [key: string]: string };\n  export default classes;\n}\ndeclare module '*.module.scss' {\n  const classes: { readonly [key: string]: string };\n  export default classes;\n}\ndeclare module '*.module.sass' {\n  const classes: { readonly [key: string]: string };\n  export default classes;\n}\n\ndeclare module '*.module.less' {\n  const classes: { readonly [key: string]: string };\n  export default classes;\n}\n\ndeclare module '*.less' {\n  const classes: { readonly [key: string]: string };\n  export default classes;\n}\n\ndeclare module '*.css' {\n  const classes: { readonly [key: string]: string };\n  export default classes;\n}\ndeclare module '*.sass' {\n  const classes: { readonly [key: string]: string };\n  export default classes;\n}\ndeclare module '*.scss' {\n  const classes: { readonly [key: string]: string };\n  export default classes;\n}\ndeclare module '*.mdx' {\n  const component: any;\n  export default component;\n}\n";

const PRETTIER_REAL_CONTENT: &str = "module.exports = {\n  \"trailingComma\": \"es5\",\n  \"tabWidth\": 2,\n  \"singleQuote\": true\n}";

pub(super) fn write_workspace_configs(
    root: &Path,
    env_ids: &[String],
    comp_dirs: &[String],
    opts: &WriteOptions,
) -> io::Result<WriteConfigFilesResult> {
    let is_dry = opts.dry_run.is_dry();
    let mut clean_results = if opts.clean && !env_ids.is_empty() {
        find_configs_to_clean(root, opts.writers.as_deref())?
    } else {
        Vec::new()
    };
    let mut write_results = build_write_results(root, env_ids, comp_dirs, opts, is_dry)?;
    finalize_clean_results(root, &write_results, &mut clean_results, is_dry);
    if is_dry && !opts.dry_run.with_content() {
        strip_dry_run_contents(&mut write_results);
    }
    Ok(WriteConfigFilesResult {
        ws_dir: root.to_string_lossy().into_owned(),
        clean_results,
        write_results,
    })
}

fn finalize_clean_results(
    root: &Path,
    write_results: &WriteResults,
    clean_results: &mut Vec<String>,
    is_dry: bool,
) {
    let written: Vec<String> = write_results.writers_result
        .iter()
        .flat_map(|writer| &writer.extending_config_files)
        .flat_map(|ext| &ext.extending_config_file.file_paths)
        .cloned()
        .collect();
    clean_results.retain(|rel| {
        !written.contains(
            &root
                .join(rel)
                .to_string_lossy()
                .into_owned(),
        )
    });
    if !is_dry {
        for rel in clean_results {
            let _ = fs::remove_file(root.join(rel));
        }
    }
}

fn build_write_results(
    root: &Path,
    env_ids: &[String],
    comp_dirs: &[String],
    opts: &WriteOptions,
    is_dry: bool,
) -> io::Result<WriteResults> {
    if env_ids.is_empty() || comp_dirs.is_empty() {
        return Ok(WriteResults::default());
    }
    let filter = opts.writers.as_deref();
    let target_dirs = target_extending_dirs(comp_dirs, opts.no_dedupe);
    let flags = (opts.force, is_dry);
    let mut writers_result = Vec::new();
    if writer_matches("typescript", filter) {
        writers_result.push(write_ts_configs(root, env_ids, comp_dirs, &target_dirs, flags)?);
    }
    if writer_matches("eslint", filter) {
        writers_result.push(write_eslint_configs(root, env_ids, comp_dirs, &target_dirs, flags)?);
    }
    if writer_matches("prettier", filter) {
        writers_result.push(write_prettier_configs(root, env_ids, &target_dirs, flags)?);
    }
    Ok(summarize_writers(writers_result))
}

fn target_extending_dirs(comp_dirs: &[String], no_dedupe: bool) -> Vec<String> {
    if !no_dedupe {
        return vec![".".to_owned()];
    }
    let mut dirs = Vec::new();
    for dir in comp_dirs {
        let trimmed = dir.trim_matches('/');
        let normalized = if trimmed.is_empty() { "." } else { trimmed };
        if !dirs
            .iter()
            .any(|existing| existing == normalized)
        {
            dirs.push(normalized.to_owned());
        }
    }
    dirs
}

fn write_ts_configs(
    root: &Path,
    env_ids: &[String],
    comp_dirs: &[String],
    target_dirs: &[String],
    flags: (bool, bool),
) -> io::Result<OneConfigWriterIdResult> {
    let cache = root.join("node_modules/.cache");
    let ts_name = format!("tsconfig.bit.{TS_RAW_HASH}.json");
    let ts_real =
        persist_real(&cache, &ts_name, TS_RAW_HASH, build_tsconfig(comp_dirs, true)?, flags.1)?;
    let asset = persist_real(
        &cache,
        &format!("global-types/asset.{ASSET_DTS_HASH}.d.ts"),
        ASSET_DTS_HASH,
        ASSET_DTS_CONTENT.into(),
        flags.1,
    )?;
    let style = persist_real(
        &cache,
        &format!("global-types/style.{STYLE_DTS_HASH}.d.ts"),
        STYLE_DTS_HASH,
        STYLE_DTS_CONTENT.into(),
        flags.1,
    )?;
    let real_files = [ts_real.clone(), asset, style]
        .into_iter()
        .map(|file| EnvsWrittenRealConfigFile {
            env_ids: env_ids.to_vec(),
            written_real_config_file: file,
        })
        .collect();
    let tpl = format!(
        "// bit-generated-typescript-config\n{{\n  \"extends\": \"{{{ts_name}}}\",\n  \"compilerOptions\": {{}}\n}}",
    );
    let spec = ("tsconfig.json", "// bit-generated-typescript-config", tpl.as_str());
    let (ext_file, skipped) = persist_extending(root, target_dirs, spec, ts_real, flags)?;
    Ok(finish_one_writer("typescript", env_ids, real_files, ext_file, skipped))
}

fn write_eslint_configs(
    root: &Path,
    env_ids: &[String],
    comp_dirs: &[String],
    target_dirs: &[String],
    flags: (bool, bool),
) -> io::Result<OneConfigWriterIdResult> {
    let cache = root.join("node_modules/.cache");
    let ts_name = format!("tsconfig.bit.eslint.{TS_RAW_HASH}.json");
    let (eslint_name, eslint_real) = persist_eslint_real(&cache, &ts_name, flags.1)?;
    let ts_real =
        persist_real(&cache, &ts_name, TS_RAW_HASH, build_tsconfig(comp_dirs, false)?, flags.1)?;
    let real_files = [eslint_real.clone(), ts_real]
        .into_iter()
        .map(|file| EnvsWrittenRealConfigFile {
            env_ids: env_ids.to_vec(),
            written_real_config_file: file,
        })
        .collect();
    let tpl = format!(
        "// bit-generated-eslint-config\n{{\n  \"extends\": [\n    \"{{{eslint_name}}}\"\n  ]\n}}",
    );
    let spec = (".eslintrc.json", "// bit-generated-eslint-config", tpl.as_str());
    let (ext_file, skipped) = persist_extending(root, target_dirs, spec, eslint_real, flags)?;
    Ok(finish_one_writer("eslint", env_ids, real_files, ext_file, skipped))
}

fn persist_eslint_real(
    cache: &Path,
    ts_name: &str,
    is_dry: bool,
) -> io::Result<(String, WrittenConfigFile)> {
    let ts_path = cache
        .join(ts_name)
        .to_string_lossy()
        .replace('\\', "/");
    let eslint_body = serde_json::to_string_pretty(&json!({
        "extends": ["@teambit/react.eslint-config-bit-react"],
        "parserOptions": { "project": ts_path },
    }))
    .map_err(io::Error::other)?;
    let eslint_hash = hex_sha1(eslint_body.as_bytes());
    let eslint_name = format!(".eslintrc.bit.{eslint_hash}.json");
    let eslint_real = persist_real(cache, &eslint_name, &eslint_hash, eslint_body, is_dry)?;
    Ok((eslint_name, eslint_real))
}

fn write_prettier_configs(
    root: &Path,
    env_ids: &[String],
    target_dirs: &[String],
    flags: (bool, bool),
) -> io::Result<OneConfigWriterIdResult> {
    let cache = root.join("node_modules/.cache");
    let prettier_name = format!(".prettierrc.bit.{PRETTIER_HASH}.cjs");
    let real_file =
        persist_real(&cache, &prettier_name, PRETTIER_HASH, PRETTIER_REAL_CONTENT.into(), flags.1)?;
    let real_files = vec![EnvsWrittenRealConfigFile {
        env_ids: env_ids.to_vec(),
        written_real_config_file: real_file.clone(),
    }];
    let tpl = format!(
        "// bit-generated-prettier-config\nmodule.exports = {{\n  ...require('{{{prettier_name}}}')\n}}",
    );
    let spec = (".prettierrc.cjs", "// bit-generated-prettier-config", tpl.as_str());
    let (ext_file, skipped) = persist_extending(root, target_dirs, spec, real_file, flags)?;
    Ok(finish_one_writer("prettier", env_ids, real_files, ext_file, skipped))
}

fn build_tsconfig(comp_dirs: &[String], include_root_dir: bool) -> io::Result<String> {
    let mut exclude = Vec::new();
    let mut include = Vec::new();
    for dir in comp_dirs {
        for suffix in
            ["artifacts", "public", "dist", "node_modules", "package.json", "**/*.cjs", "./dist"]
        {
            exclude.push(format!("../../{dir}/{suffix}"));
        }
        include.push(format!("../../{dir}/**/*"));
        include.push(format!("../../{dir}/**/*.json"));
    }
    include.push("./global-types/**/*".to_owned());
    let mut compiler_opts = json!({
        "lib": ["es2019", "DOM", "ES6", "DOM.Iterable"],
        "target": "es2015",
        "module": "CommonJS",
        "jsx": "react",
        "declaration": true,
        "sourceMap": true,
        "experimentalDecorators": true,
        "skipLibCheck": true,
        "moduleResolution": "node",
        "esModuleInterop": true,
        "resolveJsonModule": true,
        "allowJs": true,
        "outDir": "./dist",
    });
    if include_root_dir {
        compiler_opts["rootDir"] = json!("../..");
    }
    serde_json::to_string_pretty(
        &json!({ "compilerOptions": compiler_opts, "exclude": exclude, "include": include }),
    )
    .map_err(io::Error::other)
}

fn persist_real(
    cache_dir: &Path,
    name: &str,
    hash: &str,
    content: String,
    is_dry: bool,
) -> io::Result<WrittenConfigFile> {
    let full_path = cache_dir.join(name);
    if !is_dry {
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&full_path, &content)?;
    }
    Ok(WrittenConfigFile {
        name: name.to_owned(),
        hash: hash.to_owned(),
        file_path: full_path.to_string_lossy().into_owned(),
        content,
    })
}

fn persist_extending(
    root: &Path,
    target_dirs: &[String],
    spec: (&str, &str, &str),
    extending_target: WrittenConfigFile,
    flags: (bool, bool),
) -> io::Result<(WrittenExtendingConfigFile, Vec<String>)> {
    let mut written_paths = Vec::new();
    let mut skipped_paths = Vec::new();
    for rel_dir in target_dirs {
        match write_extending_in_dir(root, rel_dir, spec, &extending_target.name, flags)? {
            (Some(written), None) => written_paths.push(written),
            (None, Some(skipped)) => skipped_paths.push(skipped),
            _ => {}
        }
    }
    Ok((
        WrittenExtendingConfigFile {
            name: spec.0.to_owned(),
            hash: hex_sha1(spec.2.as_bytes()),
            content: spec.2.to_owned(),
            extending_target,
            file_paths: written_paths,
        },
        skipped_paths,
    ))
}

fn write_extending_in_dir(
    root: &Path,
    rel_dir: &str,
    spec: (&str, &str, &str),
    target_name: &str,
    flags: (bool, bool),
) -> io::Result<(Option<String>, Option<String>)> {
    let (file_name, marker, tpl) = spec;
    let dir_path = if rel_dir == "." { root.to_path_buf() } else { root.join(rel_dir) };
    let file_path = dir_path.join(file_name);
    let path_str = file_path.to_string_lossy().into_owned();
    if !flags.0 && is_user_authored(&file_path, marker) {
        return Ok((None, Some(path_str)));
    }
    let placeholder = format!("{{{target_name}}}");
    let disk_content = tpl.replace(&placeholder, &relative_to_cache(rel_dir, target_name));
    if !flags.1 {
        fs::create_dir_all(&dir_path)?;
        fs::write(&file_path, disk_content)?;
    }
    Ok((Some(path_str), None))
}

fn is_user_authored(file_path: &Path, marker: &str) -> bool {
    file_path.exists()
        && fs::read_to_string(file_path).map_or(true, |content| !content.contains(marker))
}

fn relative_to_cache(rel_dir: &str, target_name: &str) -> String {
    let normalized = rel_dir.replace('\\', "/");
    let rel_dir = normalized.trim();
    if rel_dir == "." || rel_dir.is_empty() {
        return format!("./node_modules/.cache/{target_name}");
    }
    let depth = rel_dir
        .split('/')
        .filter(|seg| !seg.is_empty() && *seg != ".")
        .count();
    if depth == 0 {
        return format!("./node_modules/.cache/{target_name}");
    }
    format!("./{}/node_modules/.cache/{target_name}", vec![".."; depth].join("/"))
}
