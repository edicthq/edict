# MCP tools are shaped around tasks, not endpoints

The MCP server exposes about twelve tools such as `update_issue` and `post_progress`, not one tool per API endpoint. Tools accept human values ("In Progress", "@amirali") and return errors that list the valid options. Agents pick wrong tools and fill their context when given forty of them. A small, forgiving set gets more work done per token.

## Consequences

Each MCP tool may call several API endpoints. New API endpoints do not automatically become tools; adding a tool is a design decision.
