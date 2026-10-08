# GameHub Game SDK

Versioned TypeScript contracts used by GameHub and its trusted game packages.
Game packages depend on this package instead of importing GameHub's private
server source.

The SDK defines package manifests, authoritative `GameSession` lifecycle
hooks, viewer-safe state and event envelopes, and browser-module platform
services. GameHub treats installed packages as trusted code and does not expose
its private room implementation through these contracts.
