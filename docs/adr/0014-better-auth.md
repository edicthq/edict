# Better Auth for authentication

Better Auth handles sign-in, organizations, invites, passkeys and OIDC, and it also acts as the OAuth 2.1 provider that MCP clients need. One TypeScript library covers human sign-in and agent authorization. Hand-rolled JWT auth would have meant building an OAuth provider ourselves, and swapping auth later touches every session and token in every instance.
