<template>
    <div class="ui-autocomplete" :class="classes">
        <div class="ui-autocomplete__icon-wrapper" v-if="icon || $slots.icon">
            <slot name="icon">
                <ui-icon :icon="icon"></ui-icon>
            </slot>
        </div>

        <div class="ui-autocomplete__content">
            <label class="ui-autocomplete__label">
                <div
                    class="ui-autocomplete__label-text"
                    :class="labelClasses"
                    v-if="label || $slots.default"
                >
                    <slot>{{ label }}</slot>
                </div>

                <ui-icon
                    class="ui-autocomplete__clear-button"
                    title="Clear"

                    @click.native="updateValue('')"

                    v-show="!disabled && valueLength > 0"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                        <path d="M18.984 6.422L13.406 12l5.578 5.578-1.406 1.406L12 13.406l-5.578 5.578-1.406-1.406L10.594 12 5.016 6.422l1.406-1.406L12 10.594l5.578-5.578z"/>
                    </svg>
                </ui-icon>

                <input
                    autocomplete="off"
                    class="ui-autocomplete__input"
                    ref="input"

                    :disabled="disabled"
                    :name="name"
                    :placeholder="hasFloatingLabel ? null : placeholder"
                    :readonly="readonly ? readonly : null"
                    :value="value"

                    @blur="onBlur"
                    @change="onChange"
                    @focus="onFocus"
                    @input="updateValue($event.target.value)"
                    @keydown.down.prevent="highlightSuggestion(highlightedIndex + 1)"
                    @keydown.enter="selectHighlighted(highlightedIndex, $event)"
                    @keydown.esc="closeDropdown"
                    @keydown.tab="closeDropdown"
                    @keydown.up.prevent="highlightSuggestion(highlightedIndex - 1)"

                    v-autofocus="autofocus"
                >

                <ul class="ui-autocomplete__suggestions" v-show="showDropdown">
                    <ui-autocomplete-suggestion
                        ref="suggestions"

                        :highlighted="highlightedIndex === index"
                        :key="index"
                        :keys="keys"
                        :suggestion="suggestion"
                        :type="type"

                        @click.native="selectSuggestion(suggestion)"

                        v-for="(suggestion, index) in matchingSuggestions"
                    >
                        <slot
                            name="suggestion"

                            :highlighted="highlightedIndex === index"
                            :index="index"
                            :suggestion="suggestion"
                        ></slot>
                    </ui-autocomplete-suggestion>
                </ul>
            </label>

            <div class="ui-autocomplete__feedback" v-if="hasFeedback">
                <div class="ui-autocomplete__feedback-text" v-if="showError">
                    <slot name="error">{{ error }}</slot>
                </div>

                <div class="ui-autocomplete__feedback-text" v-else-if="showHelp">
                    <slot name="help">{{ help }}</slot>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import autofocus from './directives/autofocus';
import UiAutocompleteSuggestion from './UiAutocompleteSuggestion.vue';
import UiIcon from './UiIcon.vue';

import fuzzysearch from 'fuzzysearch';

export default {
    name: 'ui-autocomplete',

    props: {
        name: String,
        placeholder: String,
        value: {
            type: [String, Number],
            default: ''
        },
        icon: String,
        iconPosition: {
            type: String,
            default: 'left' // 'left' or 'right'
        },
        label: String,
        floatingLabel: {
            type: Boolean,
            default: false
        },
        help: String,
        error: String,
        readonly: {
            type: Boolean,
            default: false
        },
        disabled: {
            type: Boolean,
            default: false
        },
        type: {
            type: String,
            default: 'simple' // 'simple' or 'image'
        },
        suggestions: {
            type: Array,
            default() {
                return [];
            }
        },
        limit: {
            type: Number,
            default: 8
        },
        append: {
            type: Boolean,
            default: false
        },
        appendDelimiter: {
            type: String,
            default: ', '
        },
        minChars: {
            type: Number,
            default: 2
        },
        showOnUpDown: {
            type: Boolean,
            default: true
        },
        autofocus: {
            type: Boolean,
            default: false
        },
        filter: Function,
        highlightOnFirstMatch: {
            type: Boolean,
            default: true
        },
        cycleHighlight: {
            type: Boolean,
            default: true
        },
        keys: {
            type: Object,
            default() {
                return {
                    label: 'label',
                    value: 'value',
                    image: 'image'
                };
            }
        },
        invalid: {
            type: Boolean,
            default: false
        }
    },

    data() {
        return {
            initialValue: this.value,
            isActive: false,
            isTouched: false,
            showDropdown: false,
            highlightedIndex: -1
        };
    },

    computed: {
        classes() {
            return [
                `ui-autocomplete--type-${this.type}`,
                `ui-autocomplete--icon-position-${this.iconPosition}`,
                { 'is-active': this.isActive },
                { 'is-invalid': this.invalid },
                { 'is-touched': this.isTouched },
                { 'is-disabled': this.disabled },
                { 'has-label': this.hasLabel },
                { 'has-floating-label': this.hasFloatingLabel }
            ];
        },

        labelClasses() {
            return {
                'is-inline': this.hasFloatingLabel && this.isLabelInline,
                'is-floating': this.hasFloatingLabel && !this.isLabelInline
            };
        },

        hasLabel() {
            return Boolean(this.label) || Boolean(this.$slots.default);
        },

        hasFloatingLabel() {
            return this.hasLabel && this.floatingLabel;
        },

        isLabelInline() {
            return this.valueLength === 0 && !this.isActive;
        },

        valueLength() {
            return this.value ? this.value.length : 0;
        },

        hasFeedback() {
            return Boolean(this.help) || Boolean(this.error) || Boolean(this.$slots.error);
        },

        showError() {
            return this.invalid && (Boolean(this.error) || Boolean(this.$slots.error));
        },

        showHelp() {
            return !this.showError && (Boolean(this.help) || Boolean(this.$slots.help));
        },

        matchingSuggestions() {
            return this.suggestions
                .filter((suggestion, index) => {
                    if (this.filter) {
                        return this.filter(suggestion, this.value);
                    }

                    return this.defaultFilter(suggestion, index);
                })
                .slice(0, this.limit);
        }
    },

    watch: {
        value() {
            if (this.isActive && this.valueLength >= this.minChars) {
                this.openDropdown();
            }

            this.highlightedIndex = this.highlightOnFirstMatch ? 0 : -1;
        }
    },

    created() {
        // Normalize the value to an empty string if it's null
        if (this.value === null) {
            this.initialValue = '';
            this.updateValue('');
        }
    },

    mounted() {
        document.addEventListener('click', this.onExternalClick);
    },

    beforeDestroy() {
        document.removeEventListener('click', this.onExternalClick);
    },

    methods: {
        defaultFilter(suggestion) {
            const text = suggestion[this.keys.label] || suggestion;
            let query = this.value === null ? '' : this.value;

            if (typeof query === 'string') {
                query = query.toLowerCase();
            }

            return fuzzysearch(query, text.toLowerCase());
        },

        selectSuggestion(suggestion) {
            let value;

            if (this.append) {
                value += this.appendDelimiter + (suggestion[this.keys.value] || suggestion);
            } else {
                value = suggestion[this.keys.value] || suggestion;
            }

            this.updateValue(value);
            this.$emit('select', suggestion);

            this.$nextTick(() => {
                this.closeDropdown();
                this.$refs.input.focus();
            });
        },

        highlightSuggestion(index) {
            const firstIndex = 0;
            const lastIndex = this.$refs.suggestions.length - 1;

            if (index === -2) { // Allows for cycling from first to last when cycleHighlight is disabled
                index = lastIndex;
            } else if (index < firstIndex) {
                index = this.cycleHighlight ? lastIndex : index;
            } else if (index > lastIndex) {
                index = this.cycleHighlight ? firstIndex : -1;
            }

            this.highlightedIndex = index;

            if (this.showOnUpDown) {
                this.openDropdown();
            }

            if (index < firstIndex || index > lastIndex) {
                this.$emit('highlight-overflow', index);
            } else {
                this.$emit('highlight', this.$refs.suggestions[index].suggestion, index);
            }
        },

        selectHighlighted(index, e) {
            if (this.showDropdown && this.$refs.suggestions.length > 0) {
                e.preventDefault();
                this.selectSuggestion(this.$refs.suggestions[index].suggestion);
            }
        },

        openDropdown() {
            if (!this.showDropdown) {
                this.showDropdown = true;
                this.$emit('dropdown-open');
            }
        },

        closeDropdown() {
            if (this.showDropdown) {
                this.$nextTick(() => {
                    this.showDropdown = false;
                    this.highlightedIndex = -1;
                    this.$emit('dropdown-close');
                });
            }
        },

        updateValue(value) {
            this.$emit('input', value);
        },

        onFocus(e) {
            this.isActive = true;
            this.$emit('focus', e);
        },

        onChange(e) {
            this.$emit('change', this.value, e);
        },

        onBlur(e) {
            this.isActive = false;
            this.$emit('blur', e);

            if (!this.isTouched) {
                this.isTouched = true;
                this.$emit('touch');
            }
        },

        onExternalClick(e) {
            if (!this.$el.contains(e.target) && this.showDropdown) {
                this.closeDropdown();
            }
        },

        reset() {
            // Blur input before resetting to avoid "required" errors
            // when the input is blurred after reset
            if (document.isActiveElement === this.$refs.input) {
                document.isActiveElement.blur();
            }

            // Reset state
            this.updateValue(this.initialValue);
            this.isTouched = false;
        }
    },

    components: {
        UiAutocompleteSuggestion,
        UiIcon
    },

    directives: {
        autofocus
    }
};
</script>

<style lang="scss">
@import './styles/imports';

.ui-autocomplete {
    align-items: flex-start;
    display: flex;
    font-family: $font-stack;
    margin-bottom: $ui-input-margin-bottom;
    position: relative;

    &:hover:not(.is-disabled) {
        .ui-autocomplete__label-text {
            color: $ui-input-label-color--hover;
        }

        .ui-autocomplete__input {
            border-bottom-color: $ui-input-border-color--hover;
        }
    }

    &.is-active:not(.is-disabled) {
        .ui-autocomplete__label-text,
        .ui-autocomplete__icon-wrapper .ui-icon {
            color: $ui-input-label-color--active;
        }

        .ui-autocomplete__input {
            border-bottom-color: $ui-input-border-color--active;
            border-bottom-width: $ui-input-border-width--active;
        }
    }

    &.has-floating-label {
        .ui-autocomplete__label-text {
            // Behaves like a block, but width is the width of its content.
            // Needed here so label doesn't overflow parent when scaled.
            display: table;

            &.is-inline {
                color: $ui-input-label-color; // So the hover styles don't override it
                cursor: text;
                transform: translateY($ui-input-label-top--inline) scale(1.1);
            }

            &.is-floating {
                transform: translateY(0) scale(1);
            }
        }
    }

    &.has-label {
        .ui-autocomplete__icon-wrapper {
            padding-top: $ui-input-icon-margin-top--with-label;
        }

        .ui-autocomplete__clear-button {
            top: $ui-input-button-margin-top--with-label;
        }
    }

    &.is-invalid:not(.is-disabled) {
        .ui-autocomplete__label-text,
        .ui-autocomplete__icon-wrapper .ui-icon {
            color: $ui-input-label-color--invalid;
        }

        .ui-autocomplete__input {
            border-bottom-color: $ui-input-border-color--invalid;
        }

        .ui-autocomplete__feedback {
            color: $ui-input-feedback-color--invalid;
        }
    }

    &.is-disabled {
        .ui-autocomplete__input {
            border-bottom-style: $ui-input-border-style--disabled;
            border-bottom-width: $ui-input-border-width--active;
            color: $ui-input-text-color--disabled;
        }

        .ui-autocomplete__icon-wrapper .ui-icon {
            opacity: $ui-input-icon-opacity--disabled;
        }

        .ui-autocomplete__feedback {
            opacity: $ui-input-feedback-opacity--disabled;
        }
    }
}

.ui-autocomplete__label {
    display: block;
    margin: 0;
    padding: 0;
    position: relative;
    width: 100%;
}

.ui-autocomplete__icon-wrapper {
    flex-shrink: 0;
    margin-right: $ui-input-icon-margin-right;
    padding-top: $ui-input-icon-margin-top;

    .ui-icon {
        color: $ui-input-icon-color;
    }
}

.ui-autocomplete__content {
    flex-grow: 1;
}

.ui-autocomplete__label-text {
    color: $ui-input-label-color;
    cursor: default;
    font-size: $ui-input-label-font-size;
    line-height: $ui-input-label-line-height;
    margin-bottom: $ui-input-label-margin-bottom;
    transform-origin: left;
    transition: color 0.1s ease, transform 0.2s ease;
}

.ui-autocomplete__input {
    background: none;
    border: none;
    border-bottom-color: $ui-input-border-color;
    border-bottom-style: solid;
    border-bottom-width: $ui-input-border-width;
    border-radius: 0;
    color: $ui-input-text-color;
    cursor: auto;
    font-family: $font-stack;
    font-size: $ui-input-text-font-size;
    font-weight: normal;
    height: $ui-input-height;
    outline: none;
    padding: 0;
    transition: border 0.1s ease;
    width: 100%;

    // Hide Edge and IE input clear button
    &::-ms-clear {
        display: none;
    }
}

.ui-autocomplete__clear-button {
    color: $ui-input-button-color;
    cursor: pointer;
    font-size: $ui-input-button-size;
    position: absolute;
    right: 0;
    top: $ui-input-button-margin-top;

    &:hover {
        color: $ui-input-button-color--hover;
    }
}

.ui-autocomplete__suggestions {
    background-color: white;
    box-shadow: 1px 2px 8px $md-grey-600;
    color: $primary-text-color;
    display: block;
    list-style-type: none;
    margin: 0;
    margin-bottom: rem-calc(8px);
    min-width: 100%;
    padding: 0;
    position: absolute;
    z-index: $z-index-dropdown;
}

.ui-autocomplete__feedback {
    color: $ui-input-feedback-color;
    font-size: $ui-input-feedback-font-size;
    line-height: $ui-input-feedback-line-height;
    margin: 0;
    padding-top: $ui-input-feedback-padding-top;
    position: relative;
}

// ================================================
// Icon positions
// ================================================

.ui-autocomplete--icon-position-right {
    .ui-autocomplete__icon-wrapper {
        margin-left: rem-calc(8px);
        margin-right: 0;
        order: 1;
    }
}
</style>
