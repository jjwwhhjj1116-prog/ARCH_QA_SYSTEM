# Phase 2A known limitations

- Cloudflare resources, Sites audience and production deployment are deferred.
- The local Sites development identity cannot prove hosted multi-account
  authentication; release requires an actual two-account IDOR check.
- There is no semantic XLSX/CSV parser, sheet inventory, preview or mapping.
- Project identity remains pending and no canonical row exists.
- No FIN/RC deterministic rule executes yet.
- No duplicate checksum decision, upload status GET, abort or cleanup endpoint.
- Failed/stale retry exists, but automated R2/D1 orphan reconciliation and
  retention cleanup do not.
- The app must not label `stored_unverified` as review-ready.

These limitations keep Gate 2 and the product at NO-GO.
