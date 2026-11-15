# Ambition Framework Meta-Prompts

Copy-pasteable meta-prompts that can be injected into any LLM prompt, system prompt, or agent definition.

---

## 1. The Universal Depth Meta-Prompt (Felix Prompt)

Use this when you have a feature or refactoring task and want the model to transcend standard boilerplate:

```markdown
I want a deeper version of this task, not a bigger one. Before writing any code or architecture:
1. Say what a top-tier principal engineer in this specific domain (databases, high-concurrency systems, security, financial ledgers) would do here that I am not explicitly asking for.
2. Name the rawest material and lowest-level source of truth they would start from (e.g. execution plans, transaction logs, CPU cache lines, raw sockets) instead of pre-digested abstractions.
3. Name the specific methods, instruments, and profiling tools they would use to verify performance.
4. Say what external, deterministic judge (compiler, test suite, benchmark runner)—other than you or me—will prove beyond doubt that the solution is correct.
Then rewrite my prompt and execution plan to deliver exactly that.
```

---

## 2. The Altitude Meta-Prompt (The Goal Beyond the Goal)

Use this during task conception or requirements engineering:

```markdown
Look past the immediate ticket and elevate to Altitude:
1. What is the immediate task being requested?
2. What is the Goal Beyond the Goal? What ultimate business or architectural outcome does this unlock?
3. What durable automation, invariant assertion, or regression monitor can we construct alongside this code so humans never have to manually inspect or maintain this state again?
```

---

## 3. The Range Meta-Prompt (Verbs Over Nouns & The Red Team)

Use this when scoping or reviewing code:

```markdown
1. Translate all nouns in this specification into active operational verbs:
   - What is the system actually doing to memory, database rows, locks, and external I/O?
2. Assemble an adversarial inspection crew:
   - As a forensic accountant: Where can balance precision leak or round-off?
   - As a hostile short-seller: How can two simultaneous duplicate requests exploit this endpoint?
   - As a site reliability engineer: How will this query behave when the table grows to 10,000,000 rows?
```

---

## 4. The Outside Judge Mandate

Use this in QA, test review, or before merging:

```markdown
Do NOT self-grade or assess this code mentally. 
Execute the deterministic CLI toolchain:
1. Run typecheck / compilation.
2. Run unit and integration tests.
3. Check execution time and memory limits.
Provide the raw command line output, pass/fail counts, and exit status. Any failure or absence of external proof is an immediate FAIL.
```

---

## 5. The Self-Improvement Retrospective Prompt

Use this after fixing a bug or completing a task:

```markdown
Analyze the difference between what we initially assumed and what the Outside Judge (compiler, test, profiler) proved.
1. What heuristic failed?
2. What domain rule or invariant did we violate?
3. Draft a one-line permanent invariant to append to .agents/memory/conventions.md so future agents never repeat this mistake:
   "❌ BANNED: <anti-pattern> ➔ ✅ MUST USE: <correct-pattern>"
```
