"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComponentCompareAspects = void 0;
const react_1 = __importStar(require("react"));
const classnames_1 = __importDefault(require("classnames"));
const base_ui_surfaces_split_pane_hover_splitter_1 = require("@teambit/base-ui.surfaces.split-pane.hover-splitter");
const ui_foundation_ui_buttons_collapser_1 = require("@teambit/ui-foundation.ui.buttons.collapser");
const base_ui_surfaces_split_pane_split_pane_1 = require("@teambit/base-ui.surfaces.split-pane.split-pane");
const ui_foundation_ui_hooks_use_is_mobile_1 = require("@teambit/ui-foundation.ui.hooks.use-is-mobile");
const design_ui_round_loader_1 = require("@teambit/design.ui.round-loader");
const code_ui_code_compare_1 = require("@teambit/code.ui.code-compare");
const component_ui_component_compare_hooks_use_component_compare_url_1 = require("@teambit/component.ui.component-compare.hooks.use-component-compare-url");
const component_ui_component_compare_compare_aspects_context_1 = require("@teambit/component.ui.component-compare.compare-aspects.context");
const component_ui_component_compare_compare_aspects_hooks_use_compare_aspects_1 = require("@teambit/component.ui.component-compare.compare-aspects.hooks.use-compare-aspects");
const component_ui_component_compare_compare_aspects_compare_aspect_view_1 = require("@teambit/component.ui.component-compare.compare-aspects.compare-aspect-view");
const compare_aspects_widgets_1 = require("./compare-aspects.widgets");
const compare_aspects_module_scss_1 = __importDefault(require("./compare-aspects.module.scss"));
function ComponentCompareAspects({ host, className }) {
    const { base, compare, loading, selectedBase, selectedCompare, selected } = (0, component_ui_component_compare_compare_aspects_hooks_use_compare_aspects_1.useCompareAspectsQuery)(host);
    const isMobile = (0, ui_foundation_ui_hooks_use_is_mobile_1.useIsMobile)();
    const [isSidebarOpen, setSidebarOpenness] = (0, react_1.useState)(!isMobile);
    const sidebarOpenness = isSidebarOpen ? base_ui_surfaces_split_pane_split_pane_1.Layout.row : base_ui_surfaces_split_pane_split_pane_1.Layout.left;
    const aspectNames = base.concat(compare).map((aspect) => aspect.aspectId);
    return (react_1.default.createElement(component_ui_component_compare_compare_aspects_context_1.ComponentCompareAspectsContext.Provider, { value: { base, compare, loading, selectedBase, selectedCompare } },
        react_1.default.createElement(base_ui_surfaces_split_pane_split_pane_1.SplitPane, { layout: sidebarOpenness, size: "85%", className: (0, classnames_1.default)(compare_aspects_module_scss_1.default.componentCompareAspectContainer, className) },
            react_1.default.createElement(base_ui_surfaces_split_pane_split_pane_1.Pane, { className: compare_aspects_module_scss_1.default.left },
                loading && (react_1.default.createElement("div", { className: compare_aspects_module_scss_1.default.loader },
                    react_1.default.createElement(design_ui_round_loader_1.RoundLoader, null))),
                loading || (react_1.default.createElement(component_ui_component_compare_compare_aspects_compare_aspect_view_1.CompareAspectView, { name: selected, baseAspectData: selectedBase, compareAspectData: selectedCompare, loading: loading }))),
            react_1.default.createElement(base_ui_surfaces_split_pane_hover_splitter_1.HoverSplitter, { className: compare_aspects_module_scss_1.default.splitter },
                react_1.default.createElement(ui_foundation_ui_buttons_collapser_1.Collapser, { placement: "left", isOpen: isSidebarOpen, onMouseDown: (e) => e.stopPropagation(), onClick: () => setSidebarOpenness((x) => !x), tooltipContent: `${isSidebarOpen ? 'Hide' : 'Show'} aspects tree`, className: compare_aspects_module_scss_1.default.collapser })),
            react_1.default.createElement(base_ui_surfaces_split_pane_split_pane_1.Pane, { className: (0, classnames_1.default)(compare_aspects_module_scss_1.default.right, compare_aspects_module_scss_1.default.dark) },
                react_1.default.createElement(code_ui_code_compare_1.CodeCompareTree, { fileTree: aspectNames, currentFile: selected, drawerName: 'ASPECTS', widgets: [compare_aspects_widgets_1.Widget], getHref: (node) => (0, component_ui_component_compare_hooks_use_component_compare_url_1.useUpdatedUrlFromQuery)({ aspect: node.id }) })))));
}
exports.ComponentCompareAspects = ComponentCompareAspects;
//# sourceMappingURL=compare-aspects.js.map