<template>
    <span class="ui-icon" :class="[iconSet, icon]" :aria-label="ariaLabel">
        <svg class="ui-icon__svg" v-if="useSvg">
            <use xmlns:xlink="http://www.w3.org/1999/xlink" :xlink:href="'#' + icon"></use>
        </svg>

        <slot v-else>{{ removeText ? null : icon }}</slot>
    </span>
</template>

<script>
export default {
    name: 'ui-icon',

    props: {
        icon: String,
        iconSet: {
            type: String,
            default: 'material-icons'
        },
        ariaLabel: String,
        removeText: {
            type: Boolean,
            default: false
        },
        useSvg: {
            type: Boolean,
            default: false
        }
    }
};
</script>

<style lang="scss">
@import './styles/imports';

$ui-icon-font-size  : rem-calc(24px) !default;
$ui-icon-size       : 1em !default;

.ui-icon {
    cursor: inherit;
    display: inline-block;
    font-size: $ui-icon-font-size;
    height: $ui-icon-size;
    user-select: none;
    vertical-align: middle;
    width: $ui-icon-size;

    svg {
        display: block;
        fill: currentColor;
        height: $ui-icon-size;
        margin: 0;
        padding: 0;
        width: $ui-icon-size;
    }
}
</style>
