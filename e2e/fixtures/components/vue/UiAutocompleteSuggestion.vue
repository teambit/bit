<template>
    <li class="ui-autocomplete-suggestion" :class="classes">
        <slot>
            <div class="ui-autocomplete-suggestion__simple" v-if="type === 'simple'">
                {{ suggestion[keys.label] || suggestion }}
            </div>

            <div class="ui-autocomplete-suggestion__image" v-if="type === 'image'">
                <div class="ui-autocomplete-suggestion__image-object" :style="imageStyle"></div>
                <div
                    class="ui-autocomplete-suggestion__image-text"
                >{{ suggestion[keys.label] }}</div>
            </div>
        </slot>
    </li>
</template>

<script>
export default {
    name: 'ui-autocomplete-suggestion',

    props: {
        suggestion: {
            type: [String, Object],
            required: true
        },
        type: {
            type: String,
            default: 'simple' // 'simple' or 'image'
        },
        highlighted: {
            type: Boolean,
            default: false
        },
        keys: {
            type: Object,
            default() {
                return {
                    label: 'label',
                    image: 'image'
                };
            }
        }
    },

    computed: {
        classes() {
            return [
                'ui-autocomplete-suggestion--type-' + this.type,
                { 'is-highlighted': this.highlighted }
            ];
        },

        imageStyle() {
            return { 'background-image': 'url(' + this.suggestion[this.keys.image] + ')' };
        }
    }
};
</script>

<style lang="scss">
@import './styles/imports';

.ui-autocomplete-suggestion {
    cursor: pointer;
    font-family: $font-stack;
    font-size: $ui-dropdown-item-font-size;
    padding: rem-calc(8px 12px);

    &:hover {
        background-color: rgba(black, 0.06);
    }

    &.is-highlighted {
        background-color: rgba(black, 0.1);
    }
}

.ui-autocomplete-suggestion__image {
    @include text-truncation;
    align-items: center;
    display: flex;
}

.ui-autocomplete-suggestion__image-object {
    background-position: 50%;
    background-size: cover;
    border-radius: 50%;
    height: rem-calc(32px);
    margin-right: rem-calc(12px);
    width: rem-calc(32px);
}
</style>
