//! `node_modules` links Bit owns around the engine call.
//!
//! [`linked_root_deps`] and [`link_core_aspects_to_hoisted_store`] port `calculateLinkedDeps` of
//! `dependency-linker.ts`: the running bit installation and its core aspects become `link:`
//! dependencies of the root manifest, so the engine creates their `node_modules` symlinks.
//! [`link_components`] ports `node-modules-linker.ts`: after every engine run, each workspace
//! component gets a real `node_modules/<package>` directory with symlinks to its source files and
//! a generated `package.json`. [`sync_core_aspect_links_for_envs`] ports the bootstrap bridge a
//! workspace authoring the core aspects needs.

pub use components::{
    ComponentLinkOptions, ComponentLinks, FileLink, LinkResult, link_components,
    link_prepared_component, prepared_package_manifest,
};
pub use env_links::{EnvLinks, resolved_from_env_links};
pub use root::{
    LinkOptions, link_core_aspects_to_hoisted_store, linked_root_deps,
    sync_core_aspect_links_for_envs,
};

mod components;
mod env_links;
mod link_fs;
mod package_json;
mod root;
