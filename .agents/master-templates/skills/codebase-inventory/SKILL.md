---
name: codebase-inventory
description: Index and discovery guide for pre-existing codebase services, actions, traits, helpers, and shared utilities. Reads and maintains .agents/MEMORY.md for persistent codebase context across conversations.
---

# Codebase Inventory & Persistent Memory Guide

Use this guide to inspect and leverage pre-existing architecture before writing any new code.

---

## 1. Primary Memory Source (`.agents/MEMORY.md`)
- Always inspect `.agents/MEMORY.md` first. If present, it contains the cached map of all codebase services, traits, controllers, resources, and multi-tenancy conventions.
- Update `.agents/MEMORY.md` whenever new services, actions, traits, or patterns are introduced to the repository.

---

## 2. Core Service & Business Logic Layer
- `app/Services/`: Primary business services containing domain workflows and complex operations (e.g., `CacheInvalidationService.php`).
- `app/Actions/`: Single-responsibility action classes for specific operations.

## 3. Shared Traits & Helpers
- `app/Traits/`: Reusable model behaviors, scope traits, and multi-tenancy filters (e.g., `ScopedByClient.php`).
- `app/Helpers/` or `app/Support/`: Utility functions for string manipulation, arrays, currency, and date formatting.

## 4. Data Transformation & API Contracts
- `app/Http/Resources/`: Standard API Resource transformers (e.g., `JobOrderResource.php`, `JobOrderScheduleResource.php`). All HTTP responses must utilize these existing transformers.
- `app/Http/Requests/`: Standard Form Request validation classes. Reuse existing validation rules where applicable.

---

## 5. Discovery Protocol for the Agent
Whenever fulfilling a request:
1. Read `.agents/MEMORY.md` if present.
2. If unmapped, search sibling components in the target module.
3. Check `app/Services/` and `app/Actions/` for reusable domain operations.
4. Check `app/Traits/` for pre-built behavior traits.
5. Reuse existing exception classes located in `app/Exceptions/`.
