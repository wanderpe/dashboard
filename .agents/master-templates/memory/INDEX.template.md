<!-- TEMPLATE_VERSION: 2.0.0 -->
---
id: memory.index
title: Agent Memory Master Router
updated: {{ISO_TIMESTAMP}}
version: 2.0.0
---

# Agent Memory Master Router

> **Context Optimization Rule**: Agents must never load the entire memory directory. Check this index table, identify the relevant domain tag, and read **only** the designated file.

---

## 1. Domain & Catalog Routing Table

| Knowledge Area | Grep Tag | File Link | Scope & Purpose | When to Load |
| :--- | :--- | :--- | :--- | :--- |
| **System Invariants** | `[TAG:CONVENTIONS]` | [`conventions.md`](file:///{{WORKSPACE_ROOT}}/.agents/memory/conventions.md) | Architectural rules, primary keys, precision, idempotency, multi-tenancy, auth. | Read by Architect, Reviewer, and Implementer on any feature. |
<!-- Master Agent populates discovered domain chunks below -->
{{#DOMAIN_ROUTING_ROWS}}
| **Active Service Catalog** | `[TAG:SERVICES]` | [`catalogs/services.md`](file:///{{WORKSPACE_ROOT}}/.agents/memory/catalogs/services.md) | Verified active services and reusable domain logic. | Read when looking for reusable business logic before writing new code. |
| **Database Schema** | `[TAG:SCHEMA]` | [`catalogs/models-schema.md`](file:///{{WORKSPACE_ROOT}}/.agents/memory/catalogs/models-schema.md) | Clustered database schema (Anchor entities + Compressed lookups). | Read during architecture planning or writing queries/relationships. |
| **Historical Archive** | `[TAG:ARCHIVE]` | [`MEMORY_ARCHIVE.md`](file:///{{WORKSPACE_ROOT}}/.agents/MEMORY_ARCHIVE.md) | Durable change history and completed feature logs. | Appended by Release Manager. Never auto-loaded during development. |

---

## 2. Fast Keyword Grep Index

Agents can find specific topics using `grep_search` across `.agents/memory/` using these anchor tags:

- `[TAG:CONVENTIONS]` → Coding standards, transactions, architecture conventions
{{#DOMAIN_TAG_LIST}}
- `[TAG:SERVICES]` → Active service method signatures & capabilities
- `[TAG:SCHEMA]` → Database tables, Foreign keys, Model relations

---

## 3. Active Skills Registry

Agents should load on-demand skills from `.agents/skills/<skill>/` when matching task requirements:

- `[TAG:SKILL:TENANCY]` → `multi-tenant-architecture`: Multi-tenant isolation patterns, schema design, domain routing.
- `[TAG:SKILL:TENANCY_AUTH]` → `laravel-tenancy-sanctum`: Multi-tenant host resolution, Sanctum token abilities, cross-tenant replay defense, clean code.
- `[TAG:SKILL:SECURITY]` → `laravel-security`: Laravel OWASP audit, mass-assignment, unscoped validation rules.
- `[TAG:SKILL:MIGRATION]` → `database-migrations`: Non-locking, reversible PostgreSQL migration standards.
- `[TAG:SKILL:POSTGRES]` → `postgresql-optimization`: Leading `tenant_id` composite index design, EXPLAIN analysis.
- `[TAG:SKILL:LARAVEL]` → `spatie-laravel-php`: Single-action controllers, action classes, strict typing, PSR-12.
- `[TAG:SKILL:PEST]` → `pest-testing`: Idiomatic Pest PHP expectations, datasets, architecture tests (`arch()`).
- `[TAG:SKILL:TDD]` → `laravel-tdd`: Test-driven development red-green-refactor cycle.
- `[TAG:SKILL:VERIFY]` → `verification-before-completion`: Evidence before assertions always. Mandatory CLI proof.
- `[TAG:SKILL:DEBUG]` → `systematic-debugging`: Systematic root-cause hypothesis before modifying code.
- `[TAG:SKILL:SUBAGENT]` → `subagent-driven-development`: Decomposing task packets across parallel/sequential subagents.
- `[TAG:SKILL:DIAGRAM]` → `excalidraw-diagram-generator`: Reading, generating, and updating Excalidraw blueprints.
- `[TAG:SKILL:AUDIT]` → `agent-architecture-audit`: Full-stack diagnostic for agent harnesses and memory pollution.
