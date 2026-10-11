mod directory;
mod inventory;
mod metadata;
mod mutable_store;
mod operation;
mod protocol;
mod read_store;
mod store;
mod tar_archive;
mod tar_batch;
mod tar_extensions;
mod tar_header;
mod tar_progress;
mod validate;
mod workspace;

use std::{env, io, process::ExitCode};

type Options = (usize, Option<std::path::PathBuf>, Option<(u32, u32)>);

fn options() -> Result<Options, Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().skip(1).collect();
    let mut threads =
        std::thread::available_parallelism().map_or(1, std::num::NonZeroUsize::get).min(4);
    let mut directory = None;
    let mut owner = None;
    let mut arguments = args.iter();
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--threads" => {
                threads = arguments
                    .next()
                    .ok_or("missing thread count")?
                    .parse::<usize>()?;
            }
            "--objects-dir" => {
                directory = Some(std::path::PathBuf::from(
                    arguments.next().ok_or("missing object directory")?,
                ));
            }
            "--owner" => {
                let value = arguments.next().ok_or("missing owner")?;
                let (uid, gid) = value.split_once(':').ok_or("expected owner uid:gid")?;
                owner = Some((uid.parse::<u32>()?, gid.parse::<u32>()?));
            }
            _ => return Err(
                "usage: bit-object-import [--threads 1..8] [--objects-dir PATH] [--owner uid:gid]"
                    .into(),
            ),
        }
    }
    if owner.is_some() && directory.is_none() {
        return Err("owner requires object directory".into());
    }
    if !(1..=8).contains(&threads) {
        return Err("thread count must be between 1 and 8".into());
    }
    Ok((threads, directory, owner))
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let (threads, directory, owner) = options()?;
    let store = directory.map(|directory| store::Store::new(directory, owner)).transpose()?;
    let pool = rayon::ThreadPoolBuilder::new().num_threads(threads).build()?;
    protocol::serve_with_store(
        &mut io::stdin().lock(),
        &mut io::stdout().lock(),
        &pool,
        store.as_ref(),
    )?;
    Ok(())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("bit-object-import: {error}");
            ExitCode::FAILURE
        }
    }
}
