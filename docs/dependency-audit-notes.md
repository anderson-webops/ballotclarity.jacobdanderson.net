# Dependency Audit Notes

## 2026-07-30 supported dependency state

The earlier Nuxt/Vite/esbuild advisory chain is resolved on the supported Nuxt 4 dependency line.

- The clean lockfile install resolves `nuxt@4.5.1`.
- Nuxt's builder and related development tools resolve `vite@8.1.5`.
- Vite, Nitro, Unhead, Unplugin, and `tsx` resolve `esbuild@0.28.1`.
- `npm audit --workspaces`, `npm audit --workspaces --omit=dev`, and the repository's zero-exception audit wrapper report zero vulnerabilities.
- `npm outdated --workspaces --include-workspace-root --long` reports no compatible wanted updates. The listed latest versions are unsupported next-major lines for Node types and TypeScript, plus an H3 release candidate.
- `npm ci --include=optional` and the native-binding verifier confirm that the committed lockfile installs the expected platform packages, including Linux ARM64 bindings.
- `npm run verify:backend-lockfile` confirms the separately committed backend lockfile remains independently installable under its exact install-script policy.
- Strict install-script enforcement makes clean installation fail if either dependency tree gains an unreviewed lifecycle script.
- The backend pins `express-rate-limit@8.6.1` for the recognizable administrative route boundary and supplies its own tested bounded, fail-closed in-memory store rather than relying on an unbounded request-key map.
- The local `vendor/archiver-nitro-compat` package preserves Nitro 2's default factory interface while delegating to `archiver@8.0.0`, removing the vulnerable Archiver 7 / Glob 10 / Minimatch 9 / Brace Expansion 2 chain.

Nitro 2.13.4 still imports Archiver through the default factory removed in Archiver 8. The compatibility package is deliberately narrow, directly tested, and must be removed when Nitro adopts Archiver 8 or a later supported API. Clean install, full and production audits, build, and browser gates cover this bridge.

The supported top-level dependency tree passes `npm ls --workspaces --include-workspace-root`. npm 11's diagnostic-only `npm ls --all` additionally labels two non-active optional edges as invalid: `@bomb.sh/tab` sees the hoisted `cac@7` outside its explicitly optional `cac@6` adapter range, and Vite's nested Rolldown sees Nuxt's hoisted WASM fallback while each Rolldown version retains its exact platform-native binding. Neither edge runs in the production path; the clean install, production build, and Linux ARM64 native-binding gate validate the active dependency paths without forcing unsupported transitive versions.

The production baseline remains Node 24.18.0 LTS with npm 11.16.0. Node 26 types, TypeScript 7, and H3 2 RC are intentionally not promoted until their corresponding runtime/framework lines are supported by this application and pass the full release gate.
