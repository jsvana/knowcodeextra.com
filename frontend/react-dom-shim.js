// Shim to use CDN-loaded ReactDOM global
export default window.ReactDOM;
export const {
  createRoot,
  createPortal,
  flushSync,
  render,
  hydrate,
  unmountComponentAtNode,
} = window.ReactDOM;
