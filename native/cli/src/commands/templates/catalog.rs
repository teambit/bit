//! Built-in workspace and component template catalog and formatting (`scopes/generator/generator/templates.cmd.ts`).

use crate::commands::{color::Chalk, workspace_command::format::Formatter};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TemplateDescriptor {
    pub aspect_id: &'static str,
    pub name: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<&'static str>,
    pub hidden: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<&'static str>,
}

pub(super) const WORKSPACE_STARTER_ASPECTS: &[&str] = &[
    "teambit.generator/generator",
    "teambit.react/react",
    "teambit.harmony/node",
    "teambit.harmony/aspect",
];

pub(super) const WORKSPACE_TEMPLATES: &[TemplateDescriptor] = &[
    TemplateDescriptor {
        aspect_id: "teambit.generator/generator",
        name: "basic",
        description: Some("a basic workspace"),
        hidden: false,
        env: None,
    },
    TemplateDescriptor {
        aspect_id: "teambit.react/react",
        name: "react",
        description: Some("React workspace with demo components"),
        hidden: false,
        env: Some("bitdev.react/react-env"),
    },
    TemplateDescriptor {
        aspect_id: "teambit.harmony/node",
        name: "platform",
        description: Some("Platform workspace with demo components"),
        hidden: false,
        env: Some("bitdev.node/node-env"),
    },
    TemplateDescriptor {
        aspect_id: "teambit.harmony/aspect",
        name: "harmony",
        description: Some("Harmony workspace with demo components"),
        hidden: false,
        env: Some("bitdev.symphony/symphony-env"),
    },
];

pub(super) const COMPONENT_TEMPLATES: &[TemplateDescriptor] = &[
    TemplateDescriptor {
        aspect_id: "teambit.generator/generator",
        name: "component-generator",
        description: Some(
            "create your own component generator \nDocs: https://bit.dev/reference/generator/create-generator",
        ),
        hidden: true,
        env: None,
    },
    TemplateDescriptor {
        aspect_id: "teambit.generator/generator",
        name: "component-generator",
        description: Some(
            "create your own component generator \nDocs: https://bit.dev/docs/dev-services/generator/generate-component",
        ),
        hidden: true,
        env: None,
    },
    TemplateDescriptor {
        aspect_id: "teambit.generator/generator",
        name: "starter",
        description: Some(
            "create your own workspace starter (env integrated) - \nDocs: https://bit.dev/reference/starters/create-starter",
        ),
        hidden: true,
        env: None,
    },
    TemplateDescriptor {
        aspect_id: "teambit.generator/generator",
        name: "standalone-starter",
        description: Some(
            "create your own workspace starter (standalone) - \nDocs: https://bit.dev/reference/starters/create-starter",
        ),
        hidden: true,
        env: None,
    },
    TemplateDescriptor {
        aspect_id: "teambit.pipelines/builder",
        name: "build-task",
        description: Some("create a custom build task for your component pipelines"),
        hidden: true,
        env: None,
    },
    TemplateDescriptor {
        aspect_id: "teambit.compilation/compiler",
        name: "compiler",
        description: Some("A compiler implementation"),
        hidden: true,
        env: None,
    },
    TemplateDescriptor {
        aspect_id: "teambit.react/react",
        name: "react",
        description: Some("create a React UI component"),
        hidden: false,
        env: Some("bitdev.react/react-env"),
    },
    TemplateDescriptor {
        aspect_id: "teambit.react/react",
        name: "react-app",
        description: Some("create a vite-based React app including SSR support"),
        hidden: false,
        env: Some("bitdev.react/react-env"),
    },
    TemplateDescriptor {
        aspect_id: "teambit.react/react",
        name: "react-hook",
        description: Some("create a React hook component"),
        hidden: false,
        env: Some("bitdev.react/react-env"),
    },
    TemplateDescriptor {
        aspect_id: "teambit.react/react",
        name: "theme",
        description: Some("create a React theme supporting CSS variables and CSS in JS"),
        hidden: false,
        env: Some("bitdev.react/react-env"),
    },
    TemplateDescriptor {
        aspect_id: "teambit.react/react",
        name: "react-js-component",
        description: Some("create a JS-based React component"),
        hidden: true,
        env: Some("bitdev.react/react-env"),
    },
    TemplateDescriptor {
        aspect_id: "teambit.react/react",
        name: "react-env",
        description: Some("create a custom React development environment"),
        hidden: false,
        env: Some("bitdev.general/envs/bit-env"),
    },
    TemplateDescriptor {
        aspect_id: "teambit.harmony/node",
        name: "module",
        description: Some("create a node module"),
        hidden: false,
        env: Some("bitdev.node/node-env"),
    },
    TemplateDescriptor {
        aspect_id: "teambit.harmony/node",
        name: "graphql-server",
        description: Some("create a basic apollo graphql server"),
        hidden: false,
        env: Some("bitdev.node/node-env"),
    },
    TemplateDescriptor {
        aspect_id: "teambit.harmony/node",
        name: "entity",
        description: Some("create entities to reuse data structures efficiently"),
        hidden: false,
        env: Some("bitdev.node/node-env"),
    },
    TemplateDescriptor {
        aspect_id: "teambit.harmony/node",
        name: "express-server",
        description: Some("create a basic express server"),
        hidden: false,
        env: Some("bitdev.node/node-env"),
    },
    TemplateDescriptor {
        aspect_id: "teambit.harmony/node",
        name: "bit-app",
        description: Some("create a basic bit app component, compose your own tools."),
        hidden: false,
        env: Some("bitdev.node/node-env"),
    },
    TemplateDescriptor {
        aspect_id: "teambit.harmony/node",
        name: "platform",
        description: Some("compose a platform from services and apps"),
        hidden: false,
        env: Some("bitdev.node/node-env"),
    },
    TemplateDescriptor {
        aspect_id: "teambit.harmony/node",
        name: "node-app",
        description: Some("create a basic nodejs app."),
        hidden: false,
        env: Some("bitdev.node/node-env"),
    },
    TemplateDescriptor {
        aspect_id: "teambit.harmony/node",
        name: "node-env",
        description: Some("create a customized nodejs dev environment"),
        hidden: false,
        env: Some("bitdev.general/envs/bit-env"),
    },
    TemplateDescriptor {
        aspect_id: "teambit.harmony/aspect",
        name: "aspect",
        description: Some("create an aspect, and compose to your harmony platform"),
        hidden: false,
        env: Some("bitdev.symphony/envs/symphony-env"),
    },
    TemplateDescriptor {
        aspect_id: "teambit.harmony/aspect",
        name: "harmony-env",
        description: Some("create a customized harmony dev environment"),
        hidden: false,
        env: Some("bitdev.general/envs/bit-env"),
    },
    TemplateDescriptor {
        aspect_id: "teambit.harmony/aspect",
        name: "runtime",
        description: Some(
            "builds an harmony runtime. used for development of new runtime environments for harmony",
        ),
        hidden: false,
        env: Some("bitdev.symphony/envs/symphony-env"),
    },
    TemplateDescriptor {
        aspect_id: "teambit.harmony/aspect",
        name: "harmony-platform",
        description: Some(
            "create symphony platform. compose business aspects into a unified platform",
        ),
        hidden: false,
        env: Some("bitdev.symphony/envs/symphony-env"),
    },
    TemplateDescriptor {
        aspect_id: "teambit.harmony/aspect",
        name: "platform-aspect",
        description: Some(
            "create an entry aspect for your Harmony platform. Using the Symphony platform engineering tools and configurations",
        ),
        hidden: false,
        env: Some("bitdev.symphony/envs/symphony-env"),
    },
    TemplateDescriptor {
        aspect_id: "teambit.mdx/mdx",
        name: "mdx",
        description: Some("a template for mdx components"),
        hidden: false,
        env: Some("teambit.mdx/mdx-env"),
    },
    TemplateDescriptor {
        aspect_id: "teambit.mdx/mdx",
        name: "mdx-env",
        description: Some("set up your own custom mdx env using this template"),
        hidden: false,
        env: None,
    },
];

pub(super) fn select_templates(
    inside_workspace: bool,
    show_all: bool,
    aspect: Option<&str>,
) -> Vec<TemplateDescriptor> {
    let aspect = aspect
        .map(str::trim)
        .map(|id| id.rsplit_once('@').map_or(id, |(bare, _)| bare.trim()))
        .filter(|id| !id.is_empty());
    let source = if inside_workspace { COMPONENT_TEMPLATES } else { WORKSPACE_TEMPLATES };
    source
        .iter()
        .copied()
        .filter(|tpl| {
            (show_all || !tpl.hidden) && aspect.is_none_or(|id| tpl.aspect_id.trim() == id)
        })
        .collect()
}

pub(super) fn format_templates_report(
    templates: &[TemplateDescriptor],
    inside_workspace: bool,
    chalk: Chalk,
) -> String {
    let formatter = Formatter::new(chalk);
    let title_str = if inside_workspace {
        "The following template(s) are available with the command bit create:  \nExample - bit create <template-name> <component-name>"
    } else {
        "The following template(s) are available with the command bit new: \nExample - bit new <template-name> <workspace-name>"
    };
    let title = format!("\n{}\n", formatter.title(title_str));
    let groups = group_by_aspect(templates);
    let output = groups
        .iter()
        .map(|(aspect_id, items)| format_aspect_group(aspect_id, items, chalk))
        .collect::<Vec<_>>()
        .join("\n");
    let learn_more = format!(
        "\n{}",
        formatter.hint(
            "find and add templates in https://bit.dev/reference/generator/use-component-generator"
        ),
    );
    format!("{title}{output}{learn_more}")
}

fn group_by_aspect(
    templates: &[TemplateDescriptor],
) -> Vec<(&'static str, Vec<TemplateDescriptor>)> {
    let mut groups: Vec<(&'static str, Vec<TemplateDescriptor>)> = Vec::new();
    for &tpl in templates {
        if let Some((_, list)) = groups
            .iter_mut()
            .find(|(id, _)| *id == tpl.aspect_id)
        {
            list.push(tpl);
        } else {
            groups.push((tpl.aspect_id, vec![tpl]));
        }
    }
    groups
}

fn format_aspect_group(aspect_id: &str, items: &[TemplateDescriptor], chalk: Chalk) -> String {
    let names = items
        .iter()
        .map(|tpl| {
            let desc =
                tpl.description.map_or_else(String::new, |text| chalk.dim(&format!(" ({text})")));
            format!("    {}{desc}", tpl.name)
        })
        .collect::<Vec<_>>()
        .join("\n");
    let unique_envs = unique_envs_by_frequency(items);
    let env_suffix = if unique_envs.is_empty() {
        String::new()
    } else {
        chalk.dim(&format!(" (env: {})", unique_envs.join(", ")))
    };
    let friendly = friendly_aspect_name(aspect_id);
    let bold_header = chalk.bold(&format!("{friendly}{env_suffix}"));
    let header =
        if chalk.enabled() { format!("\u{1b}[34m{bold_header}\u{1b}[39m") } else { bold_header };
    format!("{header}\n{names}\n")
}

pub(super) fn friendly_aspect_name(aspect_id: &str) -> String {
    let aspect_id = aspect_id.trim();
    let aspect_id = aspect_id.rsplit_once('@').map_or(aspect_id, |(bare, _)| bare.trim());
    if !aspect_id.starts_with("teambit.") {
        return aspect_id.to_owned();
    }
    let last_segment = aspect_id
        .rsplit('/')
        .next()
        .unwrap_or(aspect_id);
    if last_segment.eq_ignore_ascii_case("mdx") {
        return "MDX".to_owned();
    }
    last_segment
        .split('-')
        .filter(|part| !part.is_empty())
        .map(capitalize_word)
        .collect::<Vec<_>>()
        .join(" ")
}

fn capitalize_word(word: &str) -> String {
    let mut chars = word.chars();
    let Some(first) = chars.next() else {
        return String::new();
    };
    format!("{}{}", first.to_ascii_uppercase(), chars.as_str())
}

fn unique_envs_by_frequency(items: &[TemplateDescriptor]) -> Vec<&'static str> {
    let mut counts: Vec<(&'static str, usize)> = Vec::new();
    for tpl in items {
        let Some(env_id) = tpl.env
            .map(str::trim)
            .filter(|env| !env.is_empty())
        else {
            continue;
        };
        if let Some((_, count)) = counts
            .iter_mut()
            .find(|(existing, _)| *existing == env_id)
        {
            *count += 1;
        } else {
            counts.push((env_id, 1));
        }
    }
    counts.sort_by_key(|right| std::cmp::Reverse(right.1));
    counts
        .into_iter()
        .map(|(env_id, _)| env_id)
        .collect()
}
