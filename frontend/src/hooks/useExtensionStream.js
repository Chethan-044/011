/**
 * Re-exports useExtensionStream from the shared context.
 * The actual socket listener and state now live in ExtensionStreamContext
 * so data persists across route changes (Dashboard ↔ Trends).
 */
export { default } from '../context/ExtensionStreamContext.jsx';
