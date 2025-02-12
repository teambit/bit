"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deserializeWithBitId = exports.componentIssueToString = exports.formatTitle = exports.ComponentIssue = exports.ISSUE_FORMAT_SPACE = exports.ISSUE_FORMAT_SPACE_COUNT = void 0;
const chalk_1 = __importDefault(require("chalk"));
const legacy_bit_id_1 = require("@teambit/legacy-bit-id");
exports.ISSUE_FORMAT_SPACE_COUNT = 10;
exports.ISSUE_FORMAT_SPACE = ' '.repeat(exports.ISSUE_FORMAT_SPACE_COUNT);
class ComponentIssue {
    constructor() {
        this.isTagBlocker = true; // if true, it stops the tag process and shows the issue
        this.isCacheBlocker = true; // if true, it doesn't cache the component in the filesystem
        this.formatDataFunction = componentIssueToString;
    }
    get descriptionWithSolution() {
        const solution = this.formatSolution();
        return `${this.description} ${solution}`;
    }
    formatSolution() {
        return this.solution ? ` (${this.solution})` : '';
    }
    outputForCLI() {
        return formatTitle(this.descriptionWithSolution) + chalk_1.default.white(this.dataToString());
    }
    dataToString() {
        return Object.keys(this.data)
            .map((k) => {
            return `${exports.ISSUE_FORMAT_SPACE}${k} -> ${this.formatDataFunction(this.data[k])}`;
        })
            .join('\n');
    }
    toObject() {
        return {
            type: this.constructor.name,
            description: this.description,
            solution: this.solution,
            data: this.data,
        };
    }
    serialize() {
        return JSON.stringify(this.data);
    }
    deserialize(data) {
        return JSON.parse(data);
    }
}
exports.ComponentIssue = ComponentIssue;
function formatTitle(issueTitle, hasMoreData = true) {
    const colon = hasMoreData ? ':' : '';
    return chalk_1.default.yellow(`\n       ${issueTitle}${colon} \n`);
}
exports.formatTitle = formatTitle;
function componentIssueToString(value) {
    return Array.isArray(value) ? value.join(', ') : value;
}
exports.componentIssueToString = componentIssueToString;
function deserializeWithBitId(dataStr) {
    const data = JSON.parse(dataStr);
    Object.keys(data).forEach((filePath) => {
        data[filePath] = data[filePath].map((id) => new legacy_bit_id_1.BitId(id));
    });
    return data;
}
exports.deserializeWithBitId = deserializeWithBitId;
//# sourceMappingURL=component-issue.js.map