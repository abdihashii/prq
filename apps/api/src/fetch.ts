/**
 * The global `fetch` bound to `globalThis`.
 *
 * On Cloudflare Workers the native `fetch` must be invoked with `this === globalThis`;
 * a detached reference (`const f = fetch; f(...)`) throws a "Illegal invocation"
 * TypeError. Binding once gives a reference that is safe to pass around and use as an
 * injectable default on both Node and workerd. See
 * https://developers.cloudflare.com/workers/observability/errors/#illegal-invocation-errors
 */
export const defaultFetch: typeof fetch = fetch.bind(globalThis)
