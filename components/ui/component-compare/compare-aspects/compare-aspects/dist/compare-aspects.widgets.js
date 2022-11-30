"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAspectStatus = exports.Widget = void 0;
const react_1 = __importDefault(require("react"));
const lodash_1 = require("lodash");
const component_ui_component_compare_compare_aspects_context_1 = require("@teambit/component.ui.component-compare.compare-aspects.context");
const component_ui_component_compare_status_resolver_1 = require("@teambit/component.ui.component-compare.status-resolver");
function Widget({ node }) {
    const fileName = node.id;
    const componentCompareAspectsContext = (0, component_ui_component_compare_compare_aspects_context_1.useAspectCompare)();
    if (componentCompareAspectsContext === null || componentCompareAspectsContext === void 0 ? void 0 : componentCompareAspectsContext.loading)
        return null;
    const base = componentCompareAspectsContext === null || componentCompareAspectsContext === void 0 ? void 0 : componentCompareAspectsContext.base;
    const compare = componentCompareAspectsContext === null || componentCompareAspectsContext === void 0 ? void 0 : componentCompareAspectsContext.compare;
    const matchingBaseAspect = base === null || base === void 0 ? void 0 : base.find((baseAspect) => baseAspect.aspectId === fileName);
    const matchingCompareAspect = compare === null || compare === void 0 ? void 0 : compare.find((compareAspect) => compareAspect.aspectId === fileName);
    if (!matchingBaseAspect && !matchingCompareAspect)
        return null;
    const status = getAspectStatus(matchingBaseAspect, matchingCompareAspect);
    if (!status)
        return null;
    return react_1.default.createElement(component_ui_component_compare_status_resolver_1.CompareStatusResolver, { status: status });
}
exports.Widget = Widget;
function getAspectStatus(aspectA, aspectB) {
    const isUndefined = (data) => data === undefined;
    const isDeleted = (base, compare) => {
        return isUndefined(compare) && !isUndefined(base);
    };
    const isNew = (base, compare) => {
        return !isUndefined(compare) && isUndefined(base);
    };
    const baseConfig = aspectA === null || aspectA === void 0 ? void 0 : aspectA.config;
    const baseData = aspectA === null || aspectA === void 0 ? void 0 : aspectA.data;
    const compareConfig = aspectB === null || aspectB === void 0 ? void 0 : aspectB.config;
    const compareData = aspectB === null || aspectB === void 0 ? void 0 : aspectB.data;
    if (isDeleted(baseConfig, compareConfig) || isDeleted(baseData, compareData)) {
        return 'deleted';
    }
    if (isNew(baseConfig, compareConfig) || isNew(baseData, compareData)) {
        return 'new';
    }
    if (!(0, lodash_1.isEqual)(baseConfig, compareConfig) || !(0, lodash_1.isEqual)(baseData, compareData)) {
        return 'modified';
    }
    return null;
}
exports.getAspectStatus = getAspectStatus;
//# sourceMappingURL=compare-aspects.widgets.js.map