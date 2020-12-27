Server side rendering (or SSR) is done in the following form:

```tsx
/** at server: */
 // renderToString
const dom = ReactDom.renderToString(<MountPoint>{app}</MountPoint>);
const assets = { headers, scripts, ... };
const html = ReactDom.renderStaticMarkup(<Html assets={assets}>{dom}</Html>);
send(html);

/** at client: */
 // or .hydrate()
ReactDom.render(app, mountPoint);
```

We can then enrich the page with hooks:

```tsx
/** at server: */
const context = hooks.init();
const app = (
	<hooks.reactContext value={context}>
		<App />
	</hooks.reactContext>
);

const context = hooks.onBeforeRender(app, context);
const dom = ...

const assets = hooks.serialize(context);
const html = ...
send(html);

/** at client: */
const context = hooks.deserialize();
const app = (
	<hooks.reactContext value={context}>
		<App />
	</hooks.reactContext>
)

hooks.onBeforeHydrate(app, context);

const ref = ReactDom.render(app, mountPoint);

hooks.onHydrate(ref, context);
```

The rendering flow will ensure that the rendering Context will be unique per request, and keep a separation between aspects.

## Best practices

- Use ReactContext instead of mutating `App`.
- Use existing context object.
- Do not use other Aspects context object.
- Try to keep process symmetrical between server and client;

## Examples

Graphql adds extra instructions to pre-fetch queries on the server:

```tsx
 // .registerRenderHooks() ?
.registerRenderLifecycle({
	init: (request) => {
		return { client: new Client(request) };
	},
	beforeRender: (app, { client }) => {
		getDataFromTree(app);
	},
	serialize: (app, { client }) => {
		return { json: client.extract(); };
	},
	deserialize: (ref, { json }) => {
		return { client: new Client(json) };
	},
	ReactContext: ({state, children}) =>
		<GqlContext client={state.client}>{children}</GqlContext>
});
```

StyledComponents extract css from page and adds it to the `<head/>`:

```tsx
.registerRenderLifecycle({
	init: () => {
		return { sheet: new ServerStyleSheet() };
	},
	serialize: (app, { sheet }) => {
		return { styles: sheet.getStyleTags() };
	};
	ReactContext: ({state, children}) =>
		<StyleSheetManager sheet={state.sheet}>{children}</StyleSheetManager>
});
```
