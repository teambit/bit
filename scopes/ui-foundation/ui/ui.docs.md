## Server-side rendering

Server side rendering (or SSR) is done in the following form:

```tsx
/** at server: */
 // renderToString
const dom = ReactDom.renderToString(<MountPoint>{app}</MountPoint>);
const assets = { headers, scripts, ... };
const html = ReactDom.renderStaticMarkup(<Html assets={assets}>{dom}</Html>);
send(html);

/** at client: */
ReactDom.render(app, mountPoint);
 // or .hydrate()
```

We can then enrich the page with hooks:

```tsx
/** at server: */
let context = hooks.serverInit();
const app = (
	<hooks.reactContext value={context}>
		<App />
	</hooks.reactContext>
);

context = hooks.onBeforeRender(app, context);
const dom = ...

const assets = hooks.serialize(context);
const html = ...
send(html);

/** at client: */
const parsed = hooks.deserialize();
const context = hooks.browserInit(parsed);
const app = (
	<hooks.reactContext value={context}>
		<App />
	</hooks.reactContext>
)

hooks.onBeforeHydrate(app, context);

const ref = ReactDom.render(app, mountPoint);

hooks.onHydrate(ref, context);
```

The rendering flow will ensure that the rendering Context will be unique per request, and separate between aspects.

### Hiding elements before JS execution

Certain items look bad in the static HTML, and only get decent after JS executes. Tooltips are a notable example. They take up space in the DOM and only hide once their react code runs.  
For these cases, use the convenience class `--ssr-hidden`. Add this to any misbehaving elements, and it will hide them using `display: none` until reactDom.render() is complete.

### .rehydrate vs .render()

.rehydrate() attach a React virtual dom to a mount point, without asserting the virtual-dom matches the actual dom.  
.render() updates the mount point to match the react virtual dom.

On paper, `.rehydrate()` should be the preferred option, with better performance.  
In practice, `.render()` is backward compatible to React 15, and will know to "hydrate" according to the `data-reactroot` attribute on the mount point, with similar performance, and without revalidating the DOM.  
ReactDOM will also show warnings in dev mode about mismatch between ssr dom and the client side dom.

### Best practices

- Use ReactContext instead of trying to mutate `App`.
- Use existing context object.
- Do not use other Aspects' context object.
- Try to keep process symmetrical between server and client;

#### Example: Server side GraphQL

Graphql adds extra instructions to pre-fetch queries on the server:

```tsx
 // .registerRenderHooks() ?
.registerRenderLifecycle({
	serverInit: ({ browser }) => {
		const { cookie } = browser;
		return { client: new Client(GQL_INTERNAL, { cookie }) };
	},
	beforeRender: ({ client }, app) => {
		await getDataFromTree(app);
	},
	serialize: ({ client }, app) => {
		return { json: JSON.stringify(client.extract()) };
	},
	deserialize: (raw) => {
		return { state: JSON.parse(raw) };
	},
	browserInit: ({ state }) => {
		return { client: new GraphqlClient(GQL_EXTERNAL, { cache: state })}
	},
	ReactContext: ({state, children}) =>
		<GqlContext client={state.client}>{children}</GqlContext>
});
```

#### Example: Server side Styled-components

StyledComponents extracts css from page, and adds it to the `<head/>`:

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
