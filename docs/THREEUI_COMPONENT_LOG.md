# ThreeUI Component Log

Record every ThreeUI catalog item evaluated or used. This protects provenance, licensing, maintainability, accessibility, and fallback behavior.

| Date | Catalog item / ID | Source | Intended screen | License / entitlement verified | Selected | Local wrapper | Fallback | Keyboard / reduced-motion QA | Notes |
| ---- | ----------------- | ------ | --------------- | ------------------------------ | -------- | ------------- | -------- | ---------------------------- | ----- |
| —    | —                 | —      | —               | —                              | —        | —             | —        | —                            | —     |

## Required evidence for a selected item

1. Catalog search terms and returned item ID.
2. Metadata and implementation prompt retrieved through the authorized MCP connection.
3. Source or package reference obtained without bypassing access controls.
4. License and account entitlement checked.
5. Wrapper location in the repository.
6. CSS/static fallback when WebGL, motion, or the component fails.
7. Keyboard, focus, contrast, loading, error, and `prefers-reduced-motion` checks.
8. Bundle and frame-time impact measured on the target screen.

Never paste catalog source into the repository when the account or license does not permit it. If the MCP server is unavailable, continue with the fallback UI and log the limitation.
