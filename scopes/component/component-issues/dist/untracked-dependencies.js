"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UntrackedDependencies = exports.MISSING_NESTED_DEPS_SPACE = void 0;
const chalk_1 = __importDefault(require("chalk"));
const component_issue_1 = require("./component-issue");
exports.MISSING_NESTED_DEPS_SPACE = ' '.repeat(component_issue_1.ISSUE_FORMAT_SPACE_COUNT + 2);
class UntrackedDependencies extends component_issue_1.ComponentIssue {
    constructor() {
        super(...arguments);
        this.description = 'untracked file dependencies';
        this.solution = 'use "bit add <file>" to track untracked files as components';
        this.data = {};
    }
    dataToString() {
        return Object.keys(this.data)
            .map((k) => {
            let space = component_issue_1.ISSUE_FORMAT_SPACE;
            if (this.data[k].nested) {
                space = exports.MISSING_NESTED_DEPS_SPACE;
            }
            return `${space}${k} -> ${untrackedFilesComponentIssueToString(this.data[k])}`;
        })
            .join('\n');
    }
}
exports.UntrackedDependencies = UntrackedDependencies;
function untrackedFilesComponentIssueToString(value) {
    const colorizedMap = value.untrackedFiles.map((curr) => {
        if (curr.existing) {
            return `${chalk_1.default.yellow(curr.relativePath)}`;
        }
        return curr.relativePath;
    });
    return colorizedMap.join(', ');
}
//# sourceMappingURL=untracked-dependencies.js.map