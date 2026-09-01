# References and Assumption Register

This package was prepared for a Codex Sites project on 2026-09-01. Product capabilities and external integrations can change. Re-open the sources below before making irreversible architecture or release decisions.

## Primary OpenAI references

- [Sites documentation](https://learn.chatgpt.com/docs/sites) — Sites project structure, hosting manifest, D1/R2 bindings, identity, access, version saving, deployment, limits, and security notes.
- [AGENTS.md documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md) — instruction discovery, scope, precedence, and size behavior.
- [Subagents documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents) — built-in/custom agents, `.codex/agents/*.toml`, concurrency, inheritance, and orchestration.
- [MCP documentation](https://learn.chatgpt.com/docs/extend/mcp) — project-scoped `.codex/config.toml`, server configuration, authentication, tool allowlists, and approval behavior.

## ThreeUI references

- [ThreeUI Community repository](https://github.com/MengTo/threeui) — community source, package naming, examples, and license.
- [ThreeUI MCP page](https://threeui.com/mcp) — vendor landing page for the MCP offering.

## Assumptions that Codex must verify during Phase 0

| ID    | Assumption                                                                                                    | Why verification is required                   | Safe fallback                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| A-001 | The target project has Sites enabled and the user has permission to create or attach hosting resources        | Workspace and rollout state vary               | Build and test locally; stop before resource creation               |
| A-002 | `.openai/hosting.json` exists or can be created with the correct project ID and bindings                      | The ID and resource names are project-specific | Ask for/inspect the existing Sites project; never invent an ID      |
| A-003 | The ThreeUI MCP endpoint in `.codex/config.toml` is correct for the user's entitlement                        | Vendor endpoint and auth may change            | Disable the optional server and use local accessible UI primitives  |
| A-004 | The expected ThreeUI tools are `search_catalog`, `get_catalog_item`, `get_item_source`, and `get_item_prompt` | Tool names are integration-specific            | Inspect available MCP tools and update only the allowlist           |
| A-005 | The business owner has approved the FIN and RC rules, formulas, units, tolerances, and severity mapping       | Domain rules determine real-world findings     | Run fixtures in draft mode and block production decisions           |
| A-006 | AI processing, retention, and source-file handling are allowed for the target data                            | Construction data may be sensitive             | Disable AI enrichment; retain deterministic/statistical review only |

## Provenance rule

When a fact in this package conflicts with live official documentation or the actual repository, the live official source and inspected repository win. Record the resolution in `docs/DECISION_LOG.md`.
