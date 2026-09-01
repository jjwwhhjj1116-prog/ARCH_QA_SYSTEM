# ThreeUI MCP and Community Integration

## 1. Objective

Use ThreeUI to add a small number of high-quality interactive visual elements while preserving the performance, accessibility, and seriousness of a quantity-review application.

The core product must work when ThreeUI MCP is unavailable, unauthenticated, changed, or removed.

## 2. Availability and entitlement rule

The current ThreeUI MCP page identifies the service as a Pro offering. Treat MCP/source access as entitlement-controlled. The implementation agent must:

1. inspect the configured server and authenticate through the supported flow;
2. never scrape or bypass login/entitlement;
3. never copy Pro source/assets without a verified right;
4. use only the official Community package/source when falling back;
5. keep license and asset notices required by the selected item.

The project-scoped `.codex/config.toml` uses the expected remote endpoint and a read-only tool allowlist, but marks the server non-required. Verify the actual endpoint/tool schema before use.

## 3. Expected MCP discovery flow

When the connected server advertises the anticipated catalog tools, use them in this order:

1. `search_catalog`
   - Search by intent, runtime, category, interaction, accessibility, and performance needs.
   - Do not begin with a component name guessed from memory.
2. `get_catalog_item`
   - Read metadata, variants, runtime/dependencies, assets, usage, entitlement/license, controls, and source file list.
3. `get_item_prompt`
   - Read the item's official implementation guidance and constraints.
4. `get_item_source`
   - Retrieve only the selected entitled variant/source files needed.

If the tool list/schema differs, inspect `/mcp` or the server's advertised schema and adapt. Do not invent arguments. If one of these tools is absent, use the official Community workflow or no enhancement.

## 4. Codex connection workflow

Project config is shared by local Codex clients for a trusted project. Recommended verification:

```text
1. Open Codex desktop Settings → MCP servers, or use /mcp.
2. Confirm the `threeui` server is enabled.
3. Authenticate using the supported OAuth/login flow if required.
4. Inspect the advertised tool list and confirm read-only catalog tools.
5. Run a narrow catalog search before implementation.
```

Do not put account tokens in `.codex/config.toml`, prompts, or committed files.

## 5. Component selection brief

For each candidate, return this scorecard before adoption:

| Field               | Required answer                           |
| ------------------- | ----------------------------------------- |
| Product placement   | Exact route/component and user benefit    |
| Item/variant ID     | Catalog identifier/version                |
| Source              | MCP/official Community package/repository |
| Entitlement/license | Verified status and notice files          |
| Dependencies        | Packages, Three.js version, assets, fonts |
| Bundle impact       | Measured initial/lazy chunk delta         |
| Runtime impact      | CPU/GPU/frame/main-thread behavior        |
| Accessibility       | Semantics, keyboard, motion, contrast     |
| Fallback            | reduced-motion/static/no-WebGL/error      |
| Mobile              | DPR, sizing, touch, battery plan          |
| Network             | Remote requests/assets and privacy        |
| Decision            | adopt/modify/reject and reason            |

Record approved items in `docs/THREEUI_COMPONENT_LOG.md`.

## 6. Recommended placements

### Candidate A — Sign-in/onboarding mark

- restrained ambient visual;
- no input interception;
- static poster/SVG fallback;
- loads after sign-in content;
- motion disabled with reduced motion.

### Candidate B — Processing visualization

- illustrates stage changes but does not pretend to show numeric progress;
- textual stage/progress remains authoritative;
- pauses when hidden;
- not shown on dense results route.

### Candidate C — Empty-state/summary accent

- small, bounded canvas/DOM effect;
- no continuous animation after first entry where possible;
- core CTA and explanation remain standard HTML.

## 7. Rejected patterns

- full-screen shader behind tables/forms;
- 3D navigation or canvas-only controls;
- continuous WebGL on Findings/Mapping/Report pages;
- pointer effect that captures clicks/scroll;
- component requiring unapproved remote tracking/CDN/runtime;
- component forcing a conflicting React/Three version without isolation;
- copied visual recreated from a screenshot when source/license is unavailable;
- multiple Three.js versions added without a reviewed technical need;
- a visual that implies AI certainty or fake progress.

## 8. Integration boundary

Create a local wrapper such as:

```text
ui/threeui/ReviewStudioAmbient.tsx
ui/threeui/ReviewStudioAmbient.fallback.tsx
ui/threeui/threeui-adapter.ts
```

Wrapper responsibilities:

- dynamic import;
- stable container dimensions;
- error boundary/fallback;
- reduced-motion and visibility detection;
- DPR/mobile quality cap;
- cleanup of animation frames/listeners/resources;
- no direct business state mutation;
- approved local tokens/contrast;
- telemetry limited to safe performance/error events.

Do not spread catalog source imports across the application.

## 9. Community fallback

If Pro MCP cannot be used:

1. Use the official ThreeUI Community package/repository if its version and license are acceptable.
2. Inspect available exports/source and notices.
3. Add the package through the existing package manager or copy only official Community source when the chosen delivery method permits it.
4. Keep `LICENSE`, asset/font/third-party notices as required.
5. Validate React/Three peer-dependency compatibility.
6. Apply the same scorecard/performance/accessibility gates.
7. If no suitable item exists, implement a semantic CSS/SVG static accent or omit the enhancement.

The application must not be blocked because a visual catalog is unavailable.

## 10. Performance validation

Measure before/after on the exact route:

- initial JS/CSS/assets;
- lazy chunk size;
- largest content/layout shift;
- long tasks/input responsiveness;
- memory and WebGL contexts after navigation/unmount;
- FPS only as a supporting signal;
- hidden-tab/offscreen CPU;
- low-end/mobile behavior;
- network requests and caching.

Acceptance:

- core content appears and works before enhancement;
- review routes do not import Three.js initially;
- no leaked render loop/context/listener after unmount;
- reduced-motion/no-WebGL/static path passes;
- measured regression fits an approved budget.

## 11. Accessibility validation

- Canvas is decorative (`aria-hidden`) unless a tested semantic alternative exists.
- No information exists only in 3D.
- Keyboard focus never enters decorative content.
- Motion/pointer effects respect reduced motion and do not cause dizziness.
- Text contrast remains valid under every frame/background.
- Zoom/reflow does not crop controls.

## 12. Security/privacy validation

- Inspect code for network calls, dynamic code execution, remote scripts, storage, and telemetry.
- Use locally bundled/approved assets where license permits.
- Do not send project/source/user data into visual parameters or remote requests.
- Pin dependency/source version and retain provenance.
- Run dependency/license/security scans.

## 13. Completion evidence

For each item, attach:

- catalog/source reference;
- entitlement/license decision;
- screenshot at required viewports;
- reduced-motion/static/no-WebGL screenshots;
- bundle/runtime measurements;
- cleanup/navigation test;
- accessibility check;
- final adopt/reject rationale.
