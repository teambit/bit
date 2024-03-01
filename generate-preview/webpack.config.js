const webpack = require('webpack');

const basePreviewConfigFactory = require('./webpack/webpack.config.base');
const basePreviewProdConfigFactory = require('./webpack/webpack.config.base.prod');
const componentPreviewProdConfigFactory = require('./webpack/webpack.config.component.prod');

const baseConfig = basePreviewConfigFactory(!context.development);
const baseProdConfig = basePreviewProdConfigFactory();
// const baseProdConfig = basePreviewProdConfigFactory(context.development);
const componentProdConfig = componentPreviewProdConfigFactory();

const entries = {
  'teambit.scope/ui/hooks/scope-context-preview': {
    filename: 'teambit_scope_ui_hooks_scope_context-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.scope_ui_hooks_scope-context@0.0.498/dist/preview-1709310137611.js',
    dependOn: 'teambit.scope/ui/hooks/scope-context',
    library: {
      name: 'teambit.scope/ui/hooks/scope-context-preview',
      type: 'umd',
    },
  },
  'teambit.scope/ui/hooks/scope-context': {
    filename: 'teambit_scope_ui_hooks_scope_context-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.scope_ui_hooks_scope-context@0.0.498/dist/index.js',
    library: {
      name: 'teambit.scope/ui/hooks/scope-context',
      type: 'umd',
    },
  },
  'teambit.preview/ui/component-preview-preview': {
    filename: 'teambit_preview_ui_component_preview-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.preview_ui_component-preview@1.0.5/dist/preview-1709310137611.js',
    dependOn: 'teambit.preview/ui/component-preview',
    library: {
      name: 'teambit.preview/ui/component-preview-preview',
      type: 'umd',
    },
  },
  'teambit.preview/ui/component-preview': {
    filename: 'teambit_preview_ui_component_preview-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.preview_ui_component-preview@1.0.5/dist/index.js',
    library: {
      name: 'teambit.preview/ui/component-preview',
      type: 'umd',
    },
  },
  'teambit.component/ui/component-compare/models/component-compare-props-preview': {
    filename: 'teambit_component_ui_component_compare_models_component_compare_props-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_component-compare_models_component-compare-props@0.0.103/dist/preview-1709310137611.js',
    dependOn: 'teambit.component/ui/component-compare/models/component-compare-props',
    library: {
      name: 'teambit.component/ui/component-compare/models/component-compare-props-preview',
      type: 'umd',
    },
  },
  'teambit.component/ui/component-compare/models/component-compare-props': {
    filename: 'teambit_component_ui_component_compare_models_component_compare_props-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_component-compare_models_component-compare-props@0.0.103/dist/index.js',
    library: {
      name: 'teambit.component/ui/component-compare/models/component-compare-props',
      type: 'umd',
    },
  },
  'teambit.component/ui/component-compare/context-preview': {
    filename: 'teambit_component_ui_component_compare_context-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_component-compare_context@0.0.118/dist/preview-1709310137611.js',
    dependOn: 'teambit.component/ui/component-compare/context',
    library: {
      name: 'teambit.component/ui/component-compare/context-preview',
      type: 'umd',
    },
  },
  'teambit.component/ui/component-compare/context': {
    filename: 'teambit_component_ui_component_compare_context-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_component-compare_context@0.0.118/dist/index.js',
    library: {
      name: 'teambit.component/ui/component-compare/context',
      type: 'umd',
    },
  },
  'teambit.component/ui/component-compare/utils/lazy-loading-preview': {
    filename: 'teambit_component_ui_component_compare_utils_lazy_loading-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_component-compare_utils_lazy-loading@0.0.6/dist/preview-1709310137611.js',
    dependOn: 'teambit.component/ui/component-compare/utils/lazy-loading',
    library: {
      name: 'teambit.component/ui/component-compare/utils/lazy-loading-preview',
      type: 'umd',
    },
  },
  'teambit.component/ui/component-compare/utils/lazy-loading': {
    filename: 'teambit_component_ui_component_compare_utils_lazy_loading-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_component-compare_utils_lazy-loading@0.0.6/dist/index.js',
    library: {
      name: 'teambit.component/ui/component-compare/utils/lazy-loading',
      type: 'umd',
    },
  },
  'teambit.defender/ui/test-compare-preview': {
    filename: 'teambit_defender_ui_test_compare-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.defender_ui_test-compare@0.0.258/dist/preview-1709310137611.js',
    dependOn: 'teambit.defender/ui/test-compare',
    library: {
      name: 'teambit.defender/ui/test-compare-preview',
      type: 'umd',
    },
  },
  'teambit.defender/ui/test-compare': {
    filename: 'teambit_defender_ui_test_compare-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.defender_ui_test-compare@0.0.258/dist/index.js',
    library: {
      name: 'teambit.defender/ui/test-compare',
      type: 'umd',
    },
  },
  'teambit.defender/ui/test-page-preview': {
    filename: 'teambit_defender_ui_test_page-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.defender_ui_test-page@0.0.36/dist/preview-1709310137611.js',
    dependOn: 'teambit.defender/ui/test-page',
    library: {
      name: 'teambit.defender/ui/test-page-preview',
      type: 'umd',
    },
  },
  'teambit.defender/ui/test-page': {
    filename: 'teambit_defender_ui_test_page-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.defender_ui_test-page@0.0.36/dist/index.js',
    library: {
      name: 'teambit.defender/ui/test-page',
      type: 'umd',
    },
  },
  'teambit.lanes/ui/models/lanes-model-preview': {
    filename: 'teambit_lanes_ui_models_lanes_model-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.lanes_ui_models_lanes-model@0.0.212/dist/preview-1709310137611.js',
    dependOn: 'teambit.lanes/ui/models/lanes-model',
    library: {
      name: 'teambit.lanes/ui/models/lanes-model-preview',
      type: 'umd',
    },
  },
  'teambit.lanes/ui/models/lanes-model': {
    filename: 'teambit_lanes_ui_models_lanes_model-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.lanes_ui_models_lanes-model@0.0.212/dist/index.js',
    library: {
      name: 'teambit.lanes/ui/models/lanes-model',
      type: 'umd',
    },
  },
  'teambit.component/ui/component-compare/changelog-preview': {
    filename: 'teambit_component_ui_component_compare_changelog-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_component-compare_changelog@0.0.175/dist/preview-1709310137611.js',
    dependOn: 'teambit.component/ui/component-compare/changelog',
    library: {
      name: 'teambit.component/ui/component-compare/changelog-preview',
      type: 'umd',
    },
  },
  'teambit.component/ui/component-compare/changelog': {
    filename: 'teambit_component_ui_component_compare_changelog-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_component-compare_changelog@0.0.175/dist/index.js',
    library: {
      name: 'teambit.component/ui/component-compare/changelog',
      type: 'umd',
    },
  },
  'teambit.component/ui/version-block-preview': {
    filename: 'teambit_component_ui_version_block-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_version-block@0.0.882/dist/preview-1709310137611.js',
    dependOn: 'teambit.component/ui/version-block',
    library: {
      name: 'teambit.component/ui/version-block-preview',
      type: 'umd',
    },
  },
  'teambit.component/ui/version-block': {
    filename: 'teambit_component_ui_version_block-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_version-block@0.0.882/dist/index.js',
    library: {
      name: 'teambit.component/ui/version-block',
      type: 'umd',
    },
  },
  'teambit.lanes/hooks/use-lanes-preview': {
    filename: 'teambit_lanes_hooks_use_lanes-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.lanes_hooks_use-lanes@0.0.260/dist/preview-1709310137611.js',
    dependOn: 'teambit.lanes/hooks/use-lanes',
    library: {
      name: 'teambit.lanes/hooks/use-lanes-preview',
      type: 'umd',
    },
  },
  'teambit.lanes/hooks/use-lanes': {
    filename: 'teambit_lanes_hooks_use_lanes-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.lanes_hooks_use-lanes@0.0.260/dist/index.js',
    library: {
      name: 'teambit.lanes/hooks/use-lanes',
      type: 'umd',
    },
  },
  'teambit.component/ui/component-compare/version-picker-preview': {
    filename: 'teambit_component_ui_component_compare_version_picker-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_component-compare_version-picker@0.0.173/dist/preview-1709310137611.js',
    dependOn: 'teambit.component/ui/component-compare/version-picker',
    library: {
      name: 'teambit.component/ui/component-compare/version-picker-preview',
      type: 'umd',
    },
  },
  'teambit.component/ui/component-compare/version-picker': {
    filename: 'teambit_component_ui_component_compare_version_picker-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_component-compare_version-picker@0.0.173/dist/index.js',
    library: {
      name: 'teambit.component/ui/component-compare/version-picker',
      type: 'umd',
    },
  },
  'teambit.component/ui/version-dropdown-preview': {
    filename: 'teambit_component_ui_version_dropdown-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_version-dropdown@0.0.855/dist/preview-1709310137611.js',
    dependOn: 'teambit.component/ui/version-dropdown',
    library: {
      name: 'teambit.component/ui/version-dropdown-preview',
      type: 'umd',
    },
  },
  'teambit.component/ui/version-dropdown': {
    filename: 'teambit_component_ui_version_dropdown-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_version-dropdown@0.0.855/dist/index.js',
    library: {
      name: 'teambit.component/ui/version-dropdown',
      type: 'umd',
    },
  },
  'teambit.envs/ui/env-icon-preview': {
    filename: 'teambit_envs_ui_env_icon-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.envs_ui_env-icon@0.0.505/dist/preview-1709310137611.js',
    dependOn: 'teambit.envs/ui/env-icon',
    library: {
      name: 'teambit.envs/ui/env-icon-preview',
      type: 'umd',
    },
  },
  'teambit.envs/ui/env-icon': {
    filename: 'teambit_envs_ui_env_icon-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.envs_ui_env-icon@0.0.505/dist/index.js',
    library: {
      name: 'teambit.envs/ui/env-icon',
      type: 'umd',
    },
  },
  'teambit.api-reference/hooks/use-api-renderers-preview': {
    filename: 'teambit_api_reference_hooks_use_api_renderers-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_hooks_use-api-renderers@0.0.8/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/hooks/use-api-renderers',
    library: {
      name: 'teambit.api-reference/hooks/use-api-renderers-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/hooks/use-api-renderers': {
    filename: 'teambit_api_reference_hooks_use_api_renderers-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_hooks_use-api-renderers@0.0.8/dist/index.js',
    library: {
      name: 'teambit.api-reference/hooks/use-api-renderers',
      type: 'umd',
    },
  },
  'teambit.api-reference/models/api-node-renderer-preview': {
    filename: 'teambit_api_reference_models_api_node_renderer-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_models_api-node-renderer@0.0.25/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/models/api-node-renderer',
    library: {
      name: 'teambit.api-reference/models/api-node-renderer-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/models/api-node-renderer': {
    filename: 'teambit_api_reference_models_api_node_renderer-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_models_api-node-renderer@0.0.25/dist/index.js',
    library: {
      name: 'teambit.api-reference/models/api-node-renderer',
      type: 'umd',
    },
  },
  'teambit.api-reference/models/api-reference-model-preview': {
    filename: 'teambit_api_reference_models_api_reference_model-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_models_api-reference-model@0.0.25/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/models/api-reference-model',
    library: {
      name: 'teambit.api-reference/models/api-reference-model-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/models/api-reference-model': {
    filename: 'teambit_api_reference_models_api_reference_model-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_models_api-reference-model@0.0.25/dist/index.js',
    library: {
      name: 'teambit.api-reference/models/api-reference-model',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/class-preview': {
    filename: 'teambit_api_reference_renderers_class-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_class@0.0.38/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/renderers/class',
    library: {
      name: 'teambit.api-reference/renderers/class-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/class': {
    filename: 'teambit_api_reference_renderers_class-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_class@0.0.38/dist/index.js',
    library: {
      name: 'teambit.api-reference/renderers/class',
      type: 'umd',
    },
  },
  'teambit.api-reference/overview/renderers/grouped-schema-nodes-overview-summary-preview': {
    filename: 'teambit_api_reference_overview_renderers_grouped_schema_nodes_overview_summary-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_overview_renderers_grouped-schema-nodes-overview-summary@0.0.9/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/overview/renderers/grouped-schema-nodes-overview-summary',
    library: {
      name: 'teambit.api-reference/overview/renderers/grouped-schema-nodes-overview-summary-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/overview/renderers/grouped-schema-nodes-overview-summary': {
    filename: 'teambit_api_reference_overview_renderers_grouped_schema_nodes_overview_summary-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_overview_renderers_grouped-schema-nodes-overview-summary@0.0.9/dist/index.js',
    library: {
      name: 'teambit.api-reference/overview/renderers/grouped-schema-nodes-overview-summary',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/parameter-preview': {
    filename: 'teambit_api_reference_renderers_parameter-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_parameter@0.0.35/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/renderers/parameter',
    library: {
      name: 'teambit.api-reference/renderers/parameter-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/parameter': {
    filename: 'teambit_api_reference_renderers_parameter-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_parameter@0.0.35/dist/index.js',
    library: {
      name: 'teambit.api-reference/renderers/parameter',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/schema-node-member-summary-preview': {
    filename: 'teambit_api_reference_renderers_schema_node_member_summary-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_schema-node-member-summary@0.0.41/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/renderers/schema-node-member-summary',
    library: {
      name: 'teambit.api-reference/renderers/schema-node-member-summary-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/schema-node-member-summary': {
    filename: 'teambit_api_reference_renderers_schema_node_member_summary-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_schema-node-member-summary@0.0.41/dist/index.js',
    library: {
      name: 'teambit.api-reference/renderers/schema-node-member-summary',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/api-node-details-preview': {
    filename: 'teambit_api_reference_renderers_api_node_details-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_api-node-details@0.0.37/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/renderers/api-node-details',
    library: {
      name: 'teambit.api-reference/renderers/api-node-details-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/api-node-details': {
    filename: 'teambit_api_reference_renderers_api_node_details-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_api-node-details@0.0.37/dist/index.js',
    library: {
      name: 'teambit.api-reference/renderers/api-node-details',
      type: 'umd',
    },
  },
  'teambit.api-reference/hooks/use-api-ref-url-preview': {
    filename: 'teambit_api_reference_hooks_use_api_ref_url-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_hooks_use-api-ref-url@0.0.20/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/hooks/use-api-ref-url',
    library: {
      name: 'teambit.api-reference/hooks/use-api-ref-url-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/hooks/use-api-ref-url': {
    filename: 'teambit_api_reference_hooks_use_api_ref_url-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_hooks_use-api-ref-url@0.0.20/dist/index.js',
    library: {
      name: 'teambit.api-reference/hooks/use-api-ref-url',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/schema-nodes-index-preview': {
    filename: 'teambit_api_reference_renderers_schema_nodes_index-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_schema-nodes-index@0.0.34/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/renderers/schema-nodes-index',
    library: {
      name: 'teambit.api-reference/renderers/schema-nodes-index-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/schema-nodes-index': {
    filename: 'teambit_api_reference_renderers_schema_nodes_index-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_schema-nodes-index@0.0.34/dist/index.js',
    library: {
      name: 'teambit.api-reference/renderers/schema-nodes-index',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/grouped-schema-nodes-summary-preview': {
    filename: 'teambit_api_reference_renderers_grouped_schema_nodes_summary-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_grouped-schema-nodes-summary@0.0.42/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/renderers/grouped-schema-nodes-summary',
    library: {
      name: 'teambit.api-reference/renderers/grouped-schema-nodes-summary-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/grouped-schema-nodes-summary': {
    filename: 'teambit_api_reference_renderers_grouped_schema_nodes_summary-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_grouped-schema-nodes-summary@0.0.42/dist/index.js',
    library: {
      name: 'teambit.api-reference/renderers/grouped-schema-nodes-summary',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/decorator-preview': {
    filename: 'teambit_api_reference_renderers_decorator-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_decorator@0.0.2/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/renderers/decorator',
    library: {
      name: 'teambit.api-reference/renderers/decorator-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/decorator': {
    filename: 'teambit_api_reference_renderers_decorator-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_decorator@0.0.2/dist/index.js',
    library: {
      name: 'teambit.api-reference/renderers/decorator',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/enum-preview': {
    filename: 'teambit_api_reference_renderers_enum-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_enum@0.0.38/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/renderers/enum',
    library: {
      name: 'teambit.api-reference/renderers/enum-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/enum': {
    filename: 'teambit_api_reference_renderers_enum-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_enum@0.0.38/dist/index.js',
    library: {
      name: 'teambit.api-reference/renderers/enum',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/function-preview': {
    filename: 'teambit_api_reference_renderers_function-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_function@0.0.41/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/renderers/function',
    library: {
      name: 'teambit.api-reference/renderers/function-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/function': {
    filename: 'teambit_api_reference_renderers_function-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_function@0.0.41/dist/index.js',
    library: {
      name: 'teambit.api-reference/renderers/function',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/inference-type-preview': {
    filename: 'teambit_api_reference_renderers_inference_type-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_inference-type@0.0.27/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/renderers/inference-type',
    library: {
      name: 'teambit.api-reference/renderers/inference-type-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/inference-type': {
    filename: 'teambit_api_reference_renderers_inference_type-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_inference-type@0.0.27/dist/index.js',
    library: {
      name: 'teambit.api-reference/renderers/inference-type',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/interface-preview': {
    filename: 'teambit_api_reference_renderers_interface-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_interface@0.0.38/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/renderers/interface',
    library: {
      name: 'teambit.api-reference/renderers/interface-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/interface': {
    filename: 'teambit_api_reference_renderers_interface-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_interface@0.0.38/dist/index.js',
    library: {
      name: 'teambit.api-reference/renderers/interface',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/type-ref-preview': {
    filename: 'teambit_api_reference_renderers_type_ref-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_type-ref@0.0.54/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/renderers/type-ref',
    library: {
      name: 'teambit.api-reference/renderers/type-ref-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/type-ref': {
    filename: 'teambit_api_reference_renderers_type_ref-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_type-ref@0.0.54/dist/index.js',
    library: {
      name: 'teambit.api-reference/renderers/type-ref',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/type-array-preview': {
    filename: 'teambit_api_reference_renderers_type_array-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_type-array@0.0.27/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/renderers/type-array',
    library: {
      name: 'teambit.api-reference/renderers/type-array-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/type-array': {
    filename: 'teambit_api_reference_renderers_type_array-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_type-array@0.0.27/dist/index.js',
    library: {
      name: 'teambit.api-reference/renderers/type-array',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/type-intersection-preview': {
    filename: 'teambit_api_reference_renderers_type_intersection-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_type-intersection@0.0.27/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/renderers/type-intersection',
    library: {
      name: 'teambit.api-reference/renderers/type-intersection-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/type-intersection': {
    filename: 'teambit_api_reference_renderers_type_intersection-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_type-intersection@0.0.27/dist/index.js',
    library: {
      name: 'teambit.api-reference/renderers/type-intersection',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/type-literal-preview': {
    filename: 'teambit_api_reference_renderers_type_literal-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_type-literal@0.0.35/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/renderers/type-literal',
    library: {
      name: 'teambit.api-reference/renderers/type-literal-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/type-literal': {
    filename: 'teambit_api_reference_renderers_type_literal-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_type-literal@0.0.35/dist/index.js',
    library: {
      name: 'teambit.api-reference/renderers/type-literal',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/type-union-preview': {
    filename: 'teambit_api_reference_renderers_type_union-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_type-union@0.0.27/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/renderers/type-union',
    library: {
      name: 'teambit.api-reference/renderers/type-union-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/type-union': {
    filename: 'teambit_api_reference_renderers_type_union-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_type-union@0.0.27/dist/index.js',
    library: {
      name: 'teambit.api-reference/renderers/type-union',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/type-preview': {
    filename: 'teambit_api_reference_renderers_type-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_type@0.0.37/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/renderers/type',
    library: {
      name: 'teambit.api-reference/renderers/type-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/type': {
    filename: 'teambit_api_reference_renderers_type-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_type@0.0.37/dist/index.js',
    library: {
      name: 'teambit.api-reference/renderers/type',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/unresolved-preview': {
    filename: 'teambit_api_reference_renderers_unresolved-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_unresolved@0.0.37/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/renderers/unresolved',
    library: {
      name: 'teambit.api-reference/renderers/unresolved-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/unresolved': {
    filename: 'teambit_api_reference_renderers_unresolved-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_unresolved@0.0.37/dist/index.js',
    library: {
      name: 'teambit.api-reference/renderers/unresolved',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/variable-preview': {
    filename: 'teambit_api_reference_renderers_variable-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_variable@0.0.37/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/renderers/variable',
    library: {
      name: 'teambit.api-reference/renderers/variable-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/variable': {
    filename: 'teambit_api_reference_renderers_variable-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_variable@0.0.37/dist/index.js',
    library: {
      name: 'teambit.api-reference/renderers/variable',
      type: 'umd',
    },
  },
  'teambit.api-reference/sections/api-reference-page-preview': {
    filename: 'teambit_api_reference_sections_api_reference_page-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_sections_api-reference-page@0.0.63/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/sections/api-reference-page',
    library: {
      name: 'teambit.api-reference/sections/api-reference-page-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/sections/api-reference-page': {
    filename: 'teambit_api_reference_sections_api_reference_page-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_sections_api-reference-page@0.0.63/dist/index.js',
    library: {
      name: 'teambit.api-reference/sections/api-reference-page',
      type: 'umd',
    },
  },
  'teambit.api-reference/explorer/api-reference-explorer-preview': {
    filename: 'teambit_api_reference_explorer_api_reference_explorer-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_explorer_api-reference-explorer@0.0.31/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/explorer/api-reference-explorer',
    library: {
      name: 'teambit.api-reference/explorer/api-reference-explorer-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/explorer/api-reference-explorer': {
    filename: 'teambit_api_reference_explorer_api_reference_explorer-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_explorer_api-reference-explorer@0.0.31/dist/index.js',
    library: {
      name: 'teambit.api-reference/explorer/api-reference-explorer',
      type: 'umd',
    },
  },
  'teambit.api-reference/hooks/use-api-preview': {
    filename: 'teambit_api_reference_hooks_use_api-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_hooks_use-api@0.0.23/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/hooks/use-api',
    library: {
      name: 'teambit.api-reference/hooks/use-api-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/hooks/use-api': {
    filename: 'teambit_api_reference_hooks_use_api-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_hooks_use-api@0.0.23/dist/index.js',
    library: {
      name: 'teambit.api-reference/hooks/use-api',
      type: 'umd',
    },
  },
  'teambit.ui-foundation/ui/buttons/collapser-preview': {
    filename: 'teambit_ui_foundation_ui_buttons_collapser-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.ui-foundation_ui_buttons_collapser@0.0.217/dist/preview-1709310137611.js',
    dependOn: 'teambit.ui-foundation/ui/buttons/collapser',
    library: {
      name: 'teambit.ui-foundation/ui/buttons/collapser-preview',
      type: 'umd',
    },
  },
  'teambit.ui-foundation/ui/buttons/collapser': {
    filename: 'teambit_ui_foundation_ui_buttons_collapser-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.ui-foundation_ui_buttons_collapser@0.0.217/dist/index.js',
    library: {
      name: 'teambit.ui-foundation/ui/buttons/collapser',
      type: 'umd',
    },
  },
  'teambit.api-reference/sections/api-reference-section-preview': {
    filename: 'teambit_api_reference_sections_api_reference_section-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_sections_api-reference-section@0.0.14/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/sections/api-reference-section',
    library: {
      name: 'teambit.api-reference/sections/api-reference-section-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/sections/api-reference-section': {
    filename: 'teambit_api_reference_sections_api_reference_section-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_sections_api-reference-section@0.0.14/dist/index.js',
    library: {
      name: 'teambit.api-reference/sections/api-reference-section',
      type: 'umd',
    },
  },
  'teambit.code/ui/code-tab-page-preview': {
    filename: 'teambit_code_ui_code_tab_page-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.code_ui_code-tab-page@0.0.637/dist/preview-1709310137611.js',
    dependOn: 'teambit.code/ui/code-tab-page',
    library: {
      name: 'teambit.code/ui/code-tab-page-preview',
      type: 'umd',
    },
  },
  'teambit.code/ui/code-tab-page': {
    filename: 'teambit_code_ui_code_tab_page-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.code_ui_code-tab-page@0.0.637/dist/index.js',
    library: {
      name: 'teambit.code/ui/code-tab-page',
      type: 'umd',
    },
  },
  'teambit.code/ui/code-view-preview': {
    filename: 'teambit_code_ui_code_view-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.code_ui_code-view@0.0.521/dist/preview-1709310137611.js',
    dependOn: 'teambit.code/ui/code-view',
    library: {
      name: 'teambit.code/ui/code-view-preview',
      type: 'umd',
    },
  },
  'teambit.code/ui/code-view': {
    filename: 'teambit_code_ui_code_view-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.code_ui_code-view@0.0.521/dist/index.js',
    library: {
      name: 'teambit.code/ui/code-view',
      type: 'umd',
    },
  },
  'teambit.harmony/ui/hooks/use-core-aspects-preview': {
    filename: 'teambit_harmony_ui_hooks_use_core_aspects-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.harmony_ui_hooks_use-core-aspects@0.0.1/dist/preview-1709310137611.js',
    dependOn: 'teambit.harmony/ui/hooks/use-core-aspects',
    library: {
      name: 'teambit.harmony/ui/hooks/use-core-aspects-preview',
      type: 'umd',
    },
  },
  'teambit.harmony/ui/hooks/use-core-aspects': {
    filename: 'teambit_harmony_ui_hooks_use_core_aspects-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.harmony_ui_hooks_use-core-aspects@0.0.1/dist/index.js',
    library: {
      name: 'teambit.harmony/ui/hooks/use-core-aspects',
      type: 'umd',
    },
  },
  'teambit.api-reference/tagged-exports-preview': {
    filename: 'teambit_api_reference_tagged_exports-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_tagged-exports@0.0.9/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/tagged-exports',
    library: {
      name: 'teambit.api-reference/tagged-exports-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/tagged-exports': {
    filename: 'teambit_api_reference_tagged_exports-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_tagged-exports@0.0.9/dist/index.js',
    library: {
      name: 'teambit.api-reference/tagged-exports',
      type: 'umd',
    },
  },
  'teambit.compositions/composition-card-preview': {
    filename: 'teambit_compositions_composition_card-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.compositions_composition-card@0.0.205/dist/preview-1709310137611.js',
    dependOn: 'teambit.compositions/composition-card',
    library: {
      name: 'teambit.compositions/composition-card-preview',
      type: 'umd',
    },
  },
  'teambit.compositions/composition-card': {
    filename: 'teambit_compositions_composition_card-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.compositions_composition-card@0.0.205/dist/index.js',
    library: {
      name: 'teambit.compositions/composition-card',
      type: 'umd',
    },
  },
  'teambit.component/ui/component-drawer-preview': {
    filename: 'teambit_component_ui_component_drawer-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_component-drawer@0.0.393/dist/preview-1709310137611.js',
    dependOn: 'teambit.component/ui/component-drawer',
    library: {
      name: 'teambit.component/ui/component-drawer-preview',
      type: 'umd',
    },
  },
  'teambit.component/ui/component-drawer': {
    filename: 'teambit_component_ui_component_drawer-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_component-drawer@0.0.393/dist/index.js',
    library: {
      name: 'teambit.component/ui/component-drawer',
      type: 'umd',
    },
  },
  'teambit.component/ui/component-filters/component-filter-context-preview': {
    filename: 'teambit_component_ui_component_filters_component_filter_context-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_component-filters_component-filter-context@0.0.218/dist/preview-1709310137611.js',
    dependOn: 'teambit.component/ui/component-filters/component-filter-context',
    library: {
      name: 'teambit.component/ui/component-filters/component-filter-context-preview',
      type: 'umd',
    },
  },
  'teambit.component/ui/component-filters/component-filter-context': {
    filename: 'teambit_component_ui_component_filters_component_filter_context-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_component-filters_component-filter-context@0.0.218/dist/index.js',
    library: {
      name: 'teambit.component/ui/component-filters/component-filter-context',
      type: 'umd',
    },
  },
  'teambit.component/ui/component-filters/deprecate-filter-preview': {
    filename: 'teambit_component_ui_component_filters_deprecate_filter-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_component-filters_deprecate-filter@0.0.216/dist/preview-1709310137611.js',
    dependOn: 'teambit.component/ui/component-filters/deprecate-filter',
    library: {
      name: 'teambit.component/ui/component-filters/deprecate-filter-preview',
      type: 'umd',
    },
  },
  'teambit.component/ui/component-filters/deprecate-filter': {
    filename: 'teambit_component_ui_component_filters_deprecate_filter-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_component-filters_deprecate-filter@0.0.216/dist/index.js',
    library: {
      name: 'teambit.component/ui/component-filters/deprecate-filter',
      type: 'umd',
    },
  },
  'teambit.component/ui/component-filters/env-filter-preview': {
    filename: 'teambit_component_ui_component_filters_env_filter-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_component-filters_env-filter@0.0.223/dist/preview-1709310137611.js',
    dependOn: 'teambit.component/ui/component-filters/env-filter',
    library: {
      name: 'teambit.component/ui/component-filters/env-filter-preview',
      type: 'umd',
    },
  },
  'teambit.component/ui/component-filters/env-filter': {
    filename: 'teambit_component_ui_component_filters_env_filter-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_component-filters_env-filter@0.0.223/dist/index.js',
    library: {
      name: 'teambit.component/ui/component-filters/env-filter',
      type: 'umd',
    },
  },
  'teambit.component/ui/component-filters/show-main-filter-preview': {
    filename: 'teambit_component_ui_component_filters_show_main_filter-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_component-filters_show-main-filter@0.0.209/dist/preview-1709310137611.js',
    dependOn: 'teambit.component/ui/component-filters/show-main-filter',
    library: {
      name: 'teambit.component/ui/component-filters/show-main-filter-preview',
      type: 'umd',
    },
  },
  'teambit.component/ui/component-filters/show-main-filter': {
    filename: 'teambit_component_ui_component_filters_show_main_filter-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.component_ui_component-filters_show-main-filter@0.0.209/dist/index.js',
    library: {
      name: 'teambit.component/ui/component-filters/show-main-filter',
      type: 'umd',
    },
  },
  'teambit.preview/ui/preview-placeholder-preview': {
    filename: 'teambit_preview_ui_preview_placeholder-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.preview_ui_preview-placeholder@0.0.514/dist/preview-1709310137611.js',
    dependOn: 'teambit.preview/ui/preview-placeholder',
    library: {
      name: 'teambit.preview/ui/preview-placeholder-preview',
      type: 'umd',
    },
  },
  'teambit.preview/ui/preview-placeholder': {
    filename: 'teambit_preview_ui_preview_placeholder-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.preview_ui_preview-placeholder@0.0.514/dist/index.js',
    library: {
      name: 'teambit.preview/ui/preview-placeholder',
      type: 'umd',
    },
  },
  'teambit.workspace/ui/workspace-component-card-preview': {
    filename: 'teambit_workspace_ui_workspace_component_card-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.workspace_ui_workspace-component-card@0.0.521/dist/preview-1709310137611.js',
    dependOn: 'teambit.workspace/ui/workspace-component-card',
    library: {
      name: 'teambit.workspace/ui/workspace-component-card-preview',
      type: 'umd',
    },
  },
  'teambit.workspace/ui/workspace-component-card': {
    filename: 'teambit_workspace_ui_workspace_component_card-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.workspace_ui_workspace-component-card@0.0.521/dist/index.js',
    library: {
      name: 'teambit.workspace/ui/workspace-component-card',
      type: 'umd',
    },
  },
  'teambit.lanes/ui/inputs/lane-selector-preview': {
    filename: 'teambit_lanes_ui_inputs_lane_selector-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.lanes_ui_inputs_lane-selector@0.0.217/dist/preview-1709310137611.js',
    dependOn: 'teambit.lanes/ui/inputs/lane-selector',
    library: {
      name: 'teambit.lanes/ui/inputs/lane-selector-preview',
      type: 'umd',
    },
  },
  'teambit.lanes/ui/inputs/lane-selector': {
    filename: 'teambit_lanes_ui_inputs_lane_selector-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.lanes_ui_inputs_lane-selector@0.0.217/dist/index.js',
    library: {
      name: 'teambit.lanes/ui/inputs/lane-selector',
      type: 'umd',
    },
  },
  'teambit.lanes/ui/compare/lane-compare-state-preview': {
    filename: 'teambit_lanes_ui_compare_lane_compare_state-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.lanes_ui_compare_lane-compare-state@0.0.11/dist/preview-1709310137611.js',
    dependOn: 'teambit.lanes/ui/compare/lane-compare-state',
    library: {
      name: 'teambit.lanes/ui/compare/lane-compare-state-preview',
      type: 'umd',
    },
  },
  'teambit.lanes/ui/compare/lane-compare-state': {
    filename: 'teambit_lanes_ui_compare_lane_compare_state-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.lanes_ui_compare_lane-compare-state@0.0.11/dist/index.js',
    library: {
      name: 'teambit.lanes/ui/compare/lane-compare-state',
      type: 'umd',
    },
  },
  'teambit.lanes/ui/compare/lane-compare-hooks/use-lane-diff-status-preview': {
    filename: 'teambit_lanes_ui_compare_lane_compare_hooks_use_lane_diff_status-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.lanes_ui_compare_lane-compare-hooks_use-lane-diff-status@0.0.144/dist/preview-1709310137611.js',
    dependOn: 'teambit.lanes/ui/compare/lane-compare-hooks/use-lane-diff-status',
    library: {
      name: 'teambit.lanes/ui/compare/lane-compare-hooks/use-lane-diff-status-preview',
      type: 'umd',
    },
  },
  'teambit.lanes/ui/compare/lane-compare-hooks/use-lane-diff-status': {
    filename: 'teambit_lanes_ui_compare_lane_compare_hooks_use_lane_diff_status-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.lanes_ui_compare_lane-compare-hooks_use-lane-diff-status@0.0.144/dist/index.js',
    library: {
      name: 'teambit.lanes/ui/compare/lane-compare-hooks/use-lane-diff-status',
      type: 'umd',
    },
  },
  'teambit.lanes/ui/compare/lane-compare-loader-preview': {
    filename: 'teambit_lanes_ui_compare_lane_compare_loader-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.lanes_ui_compare_lane-compare-loader@0.0.6/dist/preview-1709310137611.js',
    dependOn: 'teambit.lanes/ui/compare/lane-compare-loader',
    library: {
      name: 'teambit.lanes/ui/compare/lane-compare-loader-preview',
      type: 'umd',
    },
  },
  'teambit.lanes/ui/compare/lane-compare-loader': {
    filename: 'teambit_lanes_ui_compare_lane_compare_loader-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.lanes_ui_compare_lane-compare-loader@0.0.6/dist/index.js',
    library: {
      name: 'teambit.lanes/ui/compare/lane-compare-loader',
      type: 'umd',
    },
  },
  'teambit.lanes/ui/lane-overview-preview': {
    filename: 'teambit_lanes_ui_lane_overview-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.lanes_ui_lane-overview@0.0.220/dist/preview-1709310137611.js',
    dependOn: 'teambit.lanes/ui/lane-overview',
    library: {
      name: 'teambit.lanes/ui/lane-overview-preview',
      type: 'umd',
    },
  },
  'teambit.lanes/ui/lane-overview': {
    filename: 'teambit_lanes_ui_lane_overview-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.lanes_ui_lane-overview@0.0.220/dist/index.js',
    library: {
      name: 'teambit.lanes/ui/lane-overview',
      type: 'umd',
    },
  },
  'teambit.lanes/ui/menus/use-lanes-menu-preview': {
    filename: 'teambit_lanes_ui_menus_use_lanes_menu-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.lanes_ui_menus_use-lanes-menu@0.0.211/dist/preview-1709310137611.js',
    dependOn: 'teambit.lanes/ui/menus/use-lanes-menu',
    library: {
      name: 'teambit.lanes/ui/menus/use-lanes-menu-preview',
      type: 'umd',
    },
  },
  'teambit.lanes/ui/menus/use-lanes-menu': {
    filename: 'teambit_lanes_ui_menus_use_lanes_menu-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.lanes_ui_menus_use-lanes-menu@0.0.211/dist/index.js',
    library: {
      name: 'teambit.lanes/ui/menus/use-lanes-menu',
      type: 'umd',
    },
  },
  'teambit.react/ui/compositions-app-preview': {
    filename: 'teambit_react_ui_compositions_app-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.react_ui_compositions-app@0.0.22/dist/preview-1709310137611.js',
    dependOn: 'teambit.react/ui/compositions-app',
    library: {
      name: 'teambit.react/ui/compositions-app-preview',
      type: 'umd',
    },
  },
  'teambit.react/ui/compositions-app': {
    filename: 'teambit_react_ui_compositions_app-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.react_ui_compositions-app@0.0.22/dist/index.js',
    library: {
      name: 'teambit.react/ui/compositions-app',
      type: 'umd',
    },
  },
  'teambit.react/ui/loader-fallback-preview': {
    filename: 'teambit_react_ui_loader_fallback-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.react_ui_loader-fallback@0.0.110/dist/preview-1709310137611.js',
    dependOn: 'teambit.react/ui/loader-fallback',
    library: {
      name: 'teambit.react/ui/loader-fallback-preview',
      type: 'umd',
    },
  },
  'teambit.react/ui/loader-fallback': {
    filename: 'teambit_react_ui_loader_fallback-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.react_ui_loader-fallback@0.0.110/dist/index.js',
    library: {
      name: 'teambit.react/ui/loader-fallback',
      type: 'umd',
    },
  },
  'teambit.react/ui/docs-app-preview': {
    filename: 'teambit_react_ui_docs_app-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.react_ui_docs-app@1.0.18/dist/preview-1709310137611.js',
    dependOn: 'teambit.react/ui/docs-app',
    library: {
      name: 'teambit.react/ui/docs-app-preview',
      type: 'umd',
    },
  },
  'teambit.react/ui/docs-app': {
    filename: 'teambit_react_ui_docs_app-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.react_ui_docs-app@1.0.18/dist/index.js',
    library: {
      name: 'teambit.react/ui/docs-app',
      type: 'umd',
    },
  },
  'teambit.react/ui/docs/compositions-carousel-preview': {
    filename: 'teambit_react_ui_docs_compositions_carousel-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.react_ui_docs_compositions-carousel@0.0.26/dist/preview-1709310137611.js',
    dependOn: 'teambit.react/ui/docs/compositions-carousel',
    library: {
      name: 'teambit.react/ui/docs/compositions-carousel-preview',
      type: 'umd',
    },
  },
  'teambit.react/ui/docs/compositions-carousel': {
    filename: 'teambit_react_ui_docs_compositions_carousel-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.react_ui_docs_compositions-carousel@0.0.26/dist/index.js',
    library: {
      name: 'teambit.react/ui/docs/compositions-carousel',
      type: 'umd',
    },
  },
  'teambit.react/ui/docs/apply-providers-preview': {
    filename: 'teambit_react_ui_docs_apply_providers-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.react_ui_docs_apply-providers@0.0.21/dist/preview-1709310137611.js',
    dependOn: 'teambit.react/ui/docs/apply-providers',
    library: {
      name: 'teambit.react/ui/docs/apply-providers-preview',
      type: 'umd',
    },
  },
  'teambit.react/ui/docs/apply-providers': {
    filename: 'teambit_react_ui_docs_apply_providers-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.react_ui_docs_apply-providers@0.0.21/dist/index.js',
    library: {
      name: 'teambit.react/ui/docs/apply-providers',
      type: 'umd',
    },
  },
  'teambit.react/ui/error-fallback-preview': {
    filename: 'teambit_react_ui_error_fallback-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.react_ui_error-fallback@0.0.130/dist/preview-1709310137611.js',
    dependOn: 'teambit.react/ui/error-fallback',
    library: {
      name: 'teambit.react/ui/error-fallback-preview',
      type: 'umd',
    },
  },
  'teambit.react/ui/error-fallback': {
    filename: 'teambit_react_ui_error_fallback-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.react_ui_error-fallback@0.0.130/dist/index.js',
    library: {
      name: 'teambit.react/ui/error-fallback',
      type: 'umd',
    },
  },
  'teambit.react/ui/docs/docs-content-preview': {
    filename: 'teambit_react_ui_docs_docs_content-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.react_ui_docs_docs-content@0.0.27/dist/preview-1709310137611.js',
    dependOn: 'teambit.react/ui/docs/docs-content',
    library: {
      name: 'teambit.react/ui/docs/docs-content-preview',
      type: 'umd',
    },
  },
  'teambit.react/ui/docs/docs-content': {
    filename: 'teambit_react_ui_docs_docs_content-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.react_ui_docs_docs-content@0.0.27/dist/index.js',
    library: {
      name: 'teambit.react/ui/docs/docs-content',
      type: 'umd',
    },
  },
  'teambit.react/ui/docs/properties-table-preview': {
    filename: 'teambit_react_ui_docs_properties_table-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.react_ui_docs_properties-table@0.0.24/dist/preview-1709310137611.js',
    dependOn: 'teambit.react/ui/docs/properties-table',
    library: {
      name: 'teambit.react/ui/docs/properties-table-preview',
      type: 'umd',
    },
  },
  'teambit.react/ui/docs/properties-table': {
    filename: 'teambit_react_ui_docs_properties_table-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.react_ui_docs_properties-table@0.0.24/dist/index.js',
    library: {
      name: 'teambit.react/ui/docs/properties-table',
      type: 'umd',
    },
  },
  'teambit.react/ui/highlighter/component-metadata/bit-component-meta-preview': {
    filename: 'teambit_react_ui_highlighter_component_metadata_bit_component_meta-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.react_ui_highlighter_component-metadata_bit-component-meta@0.0.41/dist/preview-1709310137611.js',
    dependOn: 'teambit.react/ui/highlighter/component-metadata/bit-component-meta',
    library: {
      name: 'teambit.react/ui/highlighter/component-metadata/bit-component-meta-preview',
      type: 'umd',
    },
  },
  'teambit.react/ui/highlighter/component-metadata/bit-component-meta': {
    filename: 'teambit_react_ui_highlighter_component_metadata_bit_component_meta-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.react_ui_highlighter_component-metadata_bit-component-meta@0.0.41/dist/index.js',
    library: {
      name: 'teambit.react/ui/highlighter/component-metadata/bit-component-meta',
      type: 'umd',
    },
  },
  'teambit.react/ui/highlighter-provider-preview': {
    filename: 'teambit_react_ui_highlighter_provider-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.react_ui_highlighter-provider@0.0.210/dist/preview-1709310137611.js',
    dependOn: 'teambit.react/ui/highlighter-provider',
    library: {
      name: 'teambit.react/ui/highlighter-provider-preview',
      type: 'umd',
    },
  },
  'teambit.react/ui/highlighter-provider': {
    filename: 'teambit_react_ui_highlighter_provider-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.react_ui_highlighter-provider@0.0.210/dist/index.js',
    library: {
      name: 'teambit.react/ui/highlighter-provider',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/react-preview': {
    filename: 'teambit_api_reference_renderers_react-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_react@0.0.24/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/renderers/react',
    library: {
      name: 'teambit.api-reference/renderers/react-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/renderers/react': {
    filename: 'teambit_api_reference_renderers_react-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_renderers_react@0.0.24/dist/index.js',
    library: {
      name: 'teambit.api-reference/renderers/react',
      type: 'umd',
    },
  },
  'teambit.docs/ui/queries/get-docs-preview': {
    filename: 'teambit_docs_ui_queries_get_docs-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.docs_ui_queries_get-docs@0.0.508/dist/preview-1709310137611.js',
    dependOn: 'teambit.docs/ui/queries/get-docs',
    library: {
      name: 'teambit.docs/ui/queries/get-docs-preview',
      type: 'umd',
    },
  },
  'teambit.docs/ui/queries/get-docs': {
    filename: 'teambit_docs_ui_queries_get_docs-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.docs_ui_queries_get-docs@0.0.508/dist/index.js',
    library: {
      name: 'teambit.docs/ui/queries/get-docs',
      type: 'umd',
    },
  },
  'teambit.cloud/ui/user-bar-preview': {
    filename: 'teambit_cloud_ui_user_bar-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.cloud_ui_user-bar@0.0.6/dist/preview-1709310137611.js',
    dependOn: 'teambit.cloud/ui/user-bar',
    library: {
      name: 'teambit.cloud/ui/user-bar-preview',
      type: 'umd',
    },
  },
  'teambit.cloud/ui/user-bar': {
    filename: 'teambit_cloud_ui_user_bar-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.cloud_ui_user-bar@0.0.6/dist/index.js',
    library: {
      name: 'teambit.cloud/ui/user-bar',
      type: 'umd',
    },
  },
  'teambit.cloud/ui/current-user-preview': {
    filename: 'teambit_cloud_ui_current_user-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.cloud_ui_current-user@0.0.5/dist/preview-1709310137611.js',
    dependOn: 'teambit.cloud/ui/current-user',
    library: {
      name: 'teambit.cloud/ui/current-user-preview',
      type: 'umd',
    },
  },
  'teambit.cloud/ui/current-user': {
    filename: 'teambit_cloud_ui_current_user-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.cloud_ui_current-user@0.0.5/dist/index.js',
    library: {
      name: 'teambit.cloud/ui/current-user',
      type: 'umd',
    },
  },
  'teambit.harmony/ui/aspect-box-preview': {
    filename: 'teambit_harmony_ui_aspect_box-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.harmony_ui_aspect-box@0.0.507/dist/preview-1709310137611.js',
    dependOn: 'teambit.harmony/ui/aspect-box',
    library: {
      name: 'teambit.harmony/ui/aspect-box-preview',
      type: 'umd',
    },
  },
  'teambit.harmony/ui/aspect-box': {
    filename: 'teambit_harmony_ui_aspect_box-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.harmony_ui_aspect-box@0.0.507/dist/index.js',
    library: {
      name: 'teambit.harmony/ui/aspect-box',
      type: 'umd',
    },
  },
  'teambit.api-reference/hooks/use-schema-preview': {
    filename: 'teambit_api_reference_hooks_use_schema-preview.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_hooks_use-schema@0.0.28/dist/preview-1709310137611.js',
    dependOn: 'teambit.api-reference/hooks/use-schema',
    library: {
      name: 'teambit.api-reference/hooks/use-schema-preview',
      type: 'umd',
    },
  },
  'teambit.api-reference/hooks/use-schema': {
    filename: 'teambit_api_reference_hooks_use_schema-component.js',
    import:
      '/Users/leimonio/Library/Caches/Bit/capsules/dd4185b333e092c2efedf41a4295b487249f37c9/teambit.api-reference_hooks_use-schema@0.0.28/dist/index.js',
    library: {
      name: 'teambit.api-reference/hooks/use-schema',
      type: 'umd',
    },
  },
};

export const config = {
  mode: 'production',
  bail: true,
  entry: entries,
  output: {
    path: '/Users/leimonio/Desktop/teambit.react__react-preview/public',
  },
  stats: {
    errorDetails: true,
  },
  resolve: {
    // TODO - check - we should not need both fallbacks and alias and provider plugin
    alias: fallbacksAliases,
    fallback: fallbacks,
  },
  plugins: [new webpack.ProvidePlugin(fallbacksProvidePluginConfig)],
  resolve: {
    alias: {
      process: '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/process@0.11.10/node_modules/process/browser.js',
      buffer: '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/buffer@6.0.3/node_modules/buffer/index.js',
      '@teambit/mdx.ui.mdx-scope-context':
        '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/@teambit+mdx.ui.mdx-scope-context@1.0.7_@types+react@17.0.76_react@17.0.2/node_modules/@teambit/mdx.ui.mdx-scope-context',
      '@mdx-js/react':
        '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/@mdx-js+react@1.6.22_react@17.0.2/node_modules/@mdx-js/react',
      react: '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/react@17.0.2/node_modules/react',
      'react-dom':
        '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/react-dom@17.0.2_react@17.0.2/node_modules/react-dom',
      'react/jsx-dev-runtime':
        '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/react@17.0.2/node_modules/react/jsx-dev-runtime.js',
      'react/jsx-runtime':
        '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/react@17.0.2/node_modules/react/jsx-runtime.js',
      'react-dom/server':
        '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/react-dom@17.0.2_react@17.0.2/node_modules/react-dom/server.js',
    },
    fallback: {
      assert: '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/assert@2.1.0/node_modules/assert/build/assert.js',
      buffer: '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/buffer@6.0.3/node_modules/buffer/index.js',
      constants:
        '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/constants-browserify@1.0.0/node_modules/constants-browserify/constants.json',
      crypto:
        '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/crypto-browserify@3.12.0/node_modules/crypto-browserify/index.js',
      domain:
        '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/domain-browser@4.19.0/node_modules/domain-browser/source/index.js',
      http: '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/stream-http@3.2.0/node_modules/stream-http/index.js',
      https:
        '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/https-browserify@1.0.0/node_modules/https-browserify/index.js',
      os: '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/os-browserify@0.3.0/node_modules/os-browserify/browser.js',
      path: '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/path-browserify@1.0.1/node_modules/path-browserify/index.js',
      punycode: '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/punycode@2.3.1/node_modules/punycode/punycode.js',
      process: '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/process@0.11.10/node_modules/process/browser.js',
      querystring:
        '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/querystring-es3@0.2.1/node_modules/querystring-es3/index.js',
      stream:
        '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/stream-browserify@3.0.0/node_modules/stream-browserify/index.js',
      string_decoder:
        '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/string_decoder@1.3.0/node_modules/string_decoder/lib/string_decoder.js',
      sys: '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/util@0.12.5/node_modules/util/util.js',
      timers:
        '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/timers-browserify@2.0.12/node_modules/timers-browserify/main.js',
      tty: '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/tty-browserify@0.0.1/node_modules/tty-browserify/index.js',
      url: '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/url@0.11.3/node_modules/url/url.js',
      util: '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/util@0.12.5/node_modules/util/util.js',
      vm: '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/vm-browserify@1.1.2/node_modules/vm-browserify/index.js',
      zlib: '/Users/leimonio/dev/bit.dev/bit/node_modules/.pnpm/browserify-zlib@0.2.0/node_modules/browserify-zlib/lib/index.js',
      fs: false,
      net: false,
      tls: false,
      child_process: false,
    },
    extensions: [
      '.web.mjs',
      '.mjs',
      '.web.js',
      '.js',
      '.cjs',
      '.web.ts',
      '.ts',
      '.web.tsx',
      '.tsx',
      '.json',
      '.web.jsx',
      '.jsx',
      '.mdx',
      '.md',
    ],
  },
  externals: {
    '@teambit/mdx.ui.mdx-scope-context': 'TeambitMdxUiMdxScopeContext',
    '@mdx-js/react': 'MdxJsReact',
    react: 'React',
    'react-dom': 'ReactDom',
  },
};

webpack(config).run();
