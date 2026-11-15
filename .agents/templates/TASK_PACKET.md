# Task Packet Specification & Template

The **Task Packet** is a lightweight, structured context container produced at the start of a feature pipeline or by the orchestrator. It ensures downstream agents receive task-specific context without having to rediscover the entire repository.

---

## Template (`.agent-work/<TASK_ID>/TASK_PACKET.yaml` or `TASK_PACKET.md`)

```yaml
task_id: <type>/<kebab-case-slug>
title: <Short imperative title>
complexity: <SMALL | MEDIUM | LARGE>
objective: <One-sentence summary of what is being changed and why>
verbs_summary: <Active verbs describing the behavior, e.g., atomically debiting balance, traversing tree without race conditions>

altitude:
  goal_beyond_goal: <The outcome beyond the immediate task, e.g., prevent complan over-allocation across all plans>
  durable_automation: <Autonomous invariant test, monitor, or regression check that enforces this outcome forever>

scope:
  files:
    - <src/modules/.../service.ts>
  modules:
    - <Domain or Module name, e.g., Complan, Orders, Users, Wallet>
  features:
    - <Feature name>

requirements:
  - <Precise requirement 1>
  - <Precise requirement 2>

constraints:
  - <Tenancy constraint, e.g., Scoped by Company ID / Client ID>
  - <Convention constraint, e.g., Strict Prisma 8 syntax only, decimal strings>
  - <Performance target, e.g., sub-5ms query execution, zero N+1 loops>
  - <No new dependencies without approval>

architecture_decisions:
  - reuse: <ExistingService.method from .agents/memory/catalogs/services.md>
  - patterns: <Established pattern to match, e.g., Prisma 8 transaction with atomic update>

acceptance_criteria:
  - <Verifiable condition 1, e.g., POST /endpoint returns 201 with standard response envelope>
  - <Verifiable condition 2, e.g., 403 returned on unauthorized role>

outside_judge:
  test_command: <CLI command for external verification, e.g., php artisan test tests/Feature/...Test.php>
  typecheck_command: php -l <file> (or ./vendor/bin/pint --test)

known_risks:
  - <Potential risk 1, e.g., N+1 query on tree traversal>
  - <Potential risk 2, e.g., race condition on balance decrement>

previous_findings:
  - <If re-entering pipeline after review/QA failure, list specific defects to fix>

required_output:
  - <List of required handoff artifacts based on complexity tier>
```

---

## Complexity Routing Guidelines

| Tier | When to Use | Assigned Agents | Required Artifacts |
| :--- | :--- | :--- | :--- |
| **SMALL** | Typos, minor bug fixes, field rename, config tweak, simple validation rule | Implementation Engineer (or Orchestrator direct) | `git diff` |
| **MEDIUM** | Single new endpoint, model query scope, multi-file tweak, service refactor | Architect → Implementation → Code Review | `ARCHITECTURE_PLAN.md`, `IMPLEMENTATION_PLAN.md`, `CODE_REVIEW.md` |
| **LARGE** | Auth, payments, financial logic, multi-tenancy, cross-domain, schema changes | Full 6-Agent Pipeline with Gates | Full artifact chain + User Gates |
