# Backend framework: Hono. Migration tool: Drizzle + libSQL

#47 left two implementation decisions open that #3's tech stack call deliberately deferred to build time: which backend/API framework, and which exact migration tool. Both are settled by the app scaffold (#62) as follows.

**Backend framework → Hono, on `@hono/node-server`.** Matches the "familiar stack" reference already used to justify React+Vite in #3, avoiding a second learning curve for a solo maintainer. It's lightweight and TypeScript-native, with none of the plugin-ecosystem overhead this app's scope doesn't need. Express was rejected as less TypeScript-native and more boilerplate for no benefit here; Fastify's plugin architecture is overkill for an app ADR-0001 already frames as having no query-performance requirements.

**Migration tool → Drizzle ORM + `drizzle-kit`, against `@libsql/client` in file mode.** Typed schema-as-code with versioned generated SQL migrations, on the same familiar-stack precedent, and it stays on the libSQL API the spec already calls out as a cheap migration path to Turso later if the deploy target ever changes. A hand-rolled raw-SQL migration runner was rejected: the domain model (ADR-0001's `kind`/metadata shape) is expected to grow tables incrementally, and typed schema-as-code catches drift for a solo maintainer with no reviewer. Kysely was rejected as a query builder only, needing a separate migration tool bolted on where Drizzle bundles both.

The scaffold's first migration establishes only Drizzle's own bookkeeping table — no domain tables, matching #47's explicit non-scope.
