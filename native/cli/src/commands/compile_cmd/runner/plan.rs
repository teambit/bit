use super::{Compiled, Options, emission, limits, linking::Links, report, write};
use crate::commands::workspace_command::component_service::{Loaded, Selection};
use std::{io, path::Path};

pub(super) struct Plan {
    loaded: Loaded,
    batch_size: usize,
    links: Links,
    directories: Vec<Vec<std::path::PathBuf>>,
    pub compiled: Vec<Compiled>,
}
impl Plan {
    pub(super) fn prepare(root: &Path, options: &Options) -> io::Result<Self> {
        if options.generate_types || (options.json && options.components.is_empty()) {
            return Err(io::Error::other("compiler options require another service"));
        }
        let batch_size = validated_batch_size(root)?;
        let selection = selection(options);
        let mut loaded = Loaded::prepare(root, &selection)?;
        if !options.components.is_empty() {
            loaded.progress.loads = vec![options.components.len()];
        }
        let components = loaded.components()?;
        let links = Links::prepare(root, &loaded)?;
        let directories = links.dist_directories(root, &loaded.progress.identities)?;
        let compiled =
            emission::prepare(root, &components, &loaded.progress.identities, &directories)?;
        validate_order(root, &compiled, options)?;
        limits::outputs(&compiled)?;
        write::validate_sources(&loaded.files)?;
        Ok(Self { loaded, batch_size, links, directories, compiled })
    }
    pub(super) fn run(
        &mut self,
        root: &Path,
        options: &Options,
        output: &bit_install::output::Output,
    ) -> io::Result<()> {
        if !options.json {
            output.status("compiling components...");
        }
        self.loaded.commit(root)?;
        for count in self.loaded.progress.loads
            .iter()
            .copied()
            .chain(std::iter::once(if options.components.is_empty() {
                self.compiled.len()
            } else {
                options.components.len()
            }))
        {
            if count > 0 {
                output.status(&format!("loading {count} component(s)"));
            }
        }
        for (row, directories) in self.compiled.iter().zip(&self.directories) {
            if options.delete_dist_dir || options.json {
                write::remove(directories)?;
            }
            report::errors(row, output);
            write::publish(&row.files, self.batch_size)?;
        }
        self.links.publish(root)
    }
}
fn validate_order(root: &Path, compiled: &[Compiled], options: &Options) -> io::Result<()> {
    let errors = compiled
        .iter()
        .filter(|row| !row.errors.is_empty())
        .count();
    if options.changed
        && options.components.is_empty()
        && compiled.len() > 1
        && (options.verbose || options.json || errors > 1)
    {
        return Err(io::Error::other("compiler diagnostic component order"));
    }
    if errors > 1 && !options.json && !options.verbose {
        let cache = bit_install::dependencies::cache::invalidation::deps_dir(root);
        if cache.join("index-v5").exists()
            && !bit_install::dependencies::cache::invalidation::needs_invalidation(root, &cache)?
        {
            return Err(io::Error::other("compiler diagnostic component order"));
        }
    }
    Ok(())
}

fn validated_batch_size(root: &Path) -> io::Result<usize> {
    let batch_size = limits::batch_size(root)?;
    if batch_size == 0 {
        return Err(io::Error::other("compiler batch size must be positive"));
    }
    Ok(batch_size)
}

fn selection(options: &Options) -> Selection {
    let exact = options.components
        .iter()
        .map(|component| component.trim().to_owned())
        .filter(|component| !component.is_empty())
        .collect::<Vec<_>>();
    Selection {
        pattern: None,
        compiler: true,
        explicit_file_order: !exact.is_empty(),
        changed: options.changed && exact.is_empty(),
        allow_cached_pair: false,
        allow_cached_many: !options.json && !options.verbose,
        single_file_write: false,
        exact: Some(exact),
    }
}
