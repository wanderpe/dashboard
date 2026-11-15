---
description: In-House Micro-LangGraph Multi-Agent State Machine with Task Complexity Routing, Deterministic Code Gates, Context Boundaries, and Strict User Gating.
---

# In-House Micro-LangGraph Multi-Agent Feature Workflow

A token-efficient, zero-dependency multi-agent state graph that enforces persistent state tracking (`STATE.json`), deterministic CLI validation gates, dynamic complexity routing, cyclic remediation loops, and human interrupt checkpoints for **Harvy's Home Lab Dashboard**.

---

## 1. State Graph Topology & Node Architecture

```mermaid
stateDiagram-v2
    [*] --> Node0_ContextBuilder: State Init (manage-state.php --action=init)
    
    Node0_ContextBuilder --> Gate0_HumanInterrupt: validate-artifact (PASS)
    
    state Gate0_HumanInterrupt {
        [*] --> UserScopeConfirmation
    }
    
    Gate0_HumanInterrupt --> Node1_Architect: Approved (MEDIUM/LARGE)
    Gate0_HumanInterrupt --> Node2_Implementer: Approved (SMALL tier fast-track)
    
    Node1_Architect --> Gate1_HumanInterrupt: validate-artifact (PASS)
    
    state Gate1_HumanInterrupt {
        [*] --> ArchitecturePlanApproval
    }
    
    Gate1_HumanInterrupt --> Node2_Implementer: Approved
    
    Node2_Implementer --> Node3_CodeReviewer: validate-artifact (PASS)
    
    Node3_CodeReviewer --> Node2_Implementer: Review FAIL (Cycle <= 3)
    Node3_CodeReviewer --> UserEscalationGate: Review FAIL (Cycle > 3)
    Node3_CodeReviewer --> Node4_QAValidator: Review PASS
    
    Node4_QAValidator --> Node2_Implementer: QA FAIL
    Node4_QAValidator --> Gate6_UserFinalVerdict: QA PASS
    
    state Gate6_UserFinalVerdict {
        [*] --> ManualVerificationApprove
    }
    
    Gate6_UserFinalVerdict --> Node5_ReleaseManager: Approved
    Gate6_UserFinalVerdict --> Node2_Implementer: Changes Requested
    
    Node5_ReleaseManager --> [*]: sync-catalogs + Release
```

---

## 2. Task Complexity Routing Matrix

| Tier | Criteria & Examples | State Graph Path | Context Budget |
| :--- | :--- | :--- | :--- |
| **SMALL** | Typos, 1-line null guards, config tweaks | **Node 0 ➔ Gate 0 ➔ Node 2 ➔ Node 4 ➔ Gate 6 ➔ Node 5** (Skips Architect/Review) | Ultra-lean (`git diff` only) |
| **MEDIUM** | Single route handler, telemetry card, UI component | **Node 0 ➔ Gate 0 ➔ Node 1 ➔ Gate 1 ➔ Node 2 ➔ Node 3 ➔ Gate 6 ➔ Node 5** | Plan + Diff + Review |
| **LARGE** | New auth provider, streaming engine, proxy architecture | **Full 7-Step Graph with all Nodes, Gates & QA Verification** | Full Waterfall |

---

## 3. The Shared State Channel (`.agent-work/<TASK_ID>/STATE.json`)

All agents read and update the machine-readable task state file:

```json
{
  "task_id": "feat/example-feature",
  "workflow_type": "FEATURE",
  "complexity": "MEDIUM",
  "current_node": "node_2_implementation",
  "status": "RUNNING",
  "review_cycles": 0,
  "qa_cycles": 0,
  "artifacts": {
    "task_context": ".agent-work/feat/example-feature/TASK_CONTEXT.md",
    "architecture_plan": ".agent-work/feat/example-feature/ARCHITECTURE_PLAN.md",
    "implementation_plan": ".agent-work/feat/example-feature/IMPLEMENTATION_PLAN.md"
  },
  "gate_checkpoints": {
    "gate_0_scope": "APPROVED",
    "gate_1_architecture": "APPROVED",
    "gate_6_final_verdict": "PENDING"
  }
}
```

---

## 4. State Machine Execution Steps

### Step 1: Node 0 — Task Context Builder & Classifier
1. **Initialize State**:
   ```bash
   php .agents/scripts/manage-state.php --action=init --task=<TASK_ID> --complexity=<SMALL|MEDIUM|LARGE>
   ```
2. **Context Policy & Skills**: Read prompt + `.agents/memory/INDEX.md` + `conventions.md`. Apply `subagent-driven-development`, `codebase-inventory`.
3. **Action**: Interactively interview user, determine complexity, output `.agent-work/<TASK_ID>/TASK_CONTEXT.md`.
4. **Deterministic Gate**:
   ```bash
   php .agents/scripts/validate-artifact.php --file=.agent-work/<TASK_ID>/TASK_CONTEXT.md --type=task_context
   ```
5. **Human Interrupt Checkpoint (Gate 0)**: Present scope. **PAUSE AND WAIT** for user confirmation.
   - Upon approval: `php .agents/scripts/manage-state.php --action=transition --task=<TASK_ID> --to=node_1_architect` (or `node_2_implementation` if SMALL).

---

### Step 2: Node 1 — Software Architect (MEDIUM / LARGE Tier)
1. **Context Policy & Skills**: Read `TASK_CONTEXT.md` + target domain chunk under `.agents/memory/domains/` + `conventions.md` + `catalogs/services.md`. Apply `shadcn`, `ui-ux-pro-max`, `architecture-designer`, `qa-engineer`.
2. **Action**: Audit reuse opportunities, evaluate QA risks, generate `ARCHITECTURE_PLAN.md` and `IMPLEMENTATION_TASKS.md`.
3. **Deterministic Gate**:
   ```bash
   php .agents/scripts/validate-artifact.php --file=.agent-work/<TASK_ID>/ARCHITECTURE_PLAN.md --type=architecture
   ```
4. **Human Interrupt Checkpoint (Gate 1)**: Present architecture plan. **PAUSE AND WAIT** for user approval.
   - Upon approval: `php .agents/scripts/manage-state.php --action=transition --task=<TASK_ID> --to=node_2_implementation`

---

### Step 3: Node 2 — Implementation Engineer
1. **Context Policy & Skills**: Read `STATE.json`, `ARCHITECTURE_PLAN.md`, `IMPLEMENTATION_TASKS.md`, `ACCEPTANCE_CRITERIA.md`. Apply `shadcn`, `ui-ux-pro-max`, `verification-before-completion`, `systematic-debugging`.
2. **Action**:
   - **Rule 0**: Draft `IMPLEMENTATION_PLAN.md` before editing any code.
   - **Deterministic Gate**: `php .agents/scripts/validate-artifact.php --file=.agent-work/<TASK_ID>/IMPLEMENTATION_PLAN.md --type=implementation_plan`.
   - Implement minimal surgical changes following SOLID and Next.js 16 App Router principles.
   - Self-review via `git diff`.
3. **State Transition**:
   ```bash
   php .agents/scripts/manage-state.php --action=transition --task=<TASK_ID> --to=node_3_code_reviewer
   ```

---

### Step 4: Node 3 — Code Reviewer (Diff-Centric)
1. **Context Policy & Skills**: Read `git diff` + `ACCEPTANCE_CRITERIA.md` + `conventions.md`. Apply `verification-before-completion`, `qa-engineer`.
2. **Action**: Adversarial review using severity vectors (`🔴 bug:`, `🟡 risk:`, `🔵 nit:`, `❓ q:`). Verify timingSafeEqual, socket timeouts, secret hygiene, and stream cleanup. Generate Mermaid sequence flow.
3. **Output**: `CODE_REVIEW.md` (`CODE_REVIEW_STATUS: PASS | FAIL`).
4. **Deterministic Gate**:
   ```bash
   php .agents/scripts/validate-artifact.php --file=.agent-work/<TASK_ID>/CODE_REVIEW.md --type=code_review
   ```
5. **Conditional Edge Decision**:
   ```bash
   php .agents/scripts/manage-state.php --action=set-verdict --task=<TASK_ID> --target=review --verdict=<PASS|FAIL>
   ```
   - **If FAIL (cycle ≤ 3)**: Automatically loops back to Node 2 (Implementer).
   - **If FAIL (cycle > 3)**: Halts at **User Escalation Gate** (Circuit Breaker).
   - **If PASS**: Advances to Node 4 (QA Validator).

---

### Step 5: Node 4 — QA Validator
1. **Context Policy & Skills**: Read `ACCEPTANCE_CRITERIA.md`, `QA_CRITERIA.md`, `CODE_REVIEW.md` (findings only), `git diff`. Apply `verification-before-completion`, `systematic-debugging`, `qa-engineer`.
2. **Action**: Validate requirements using FIRST assertion matrix, execute deterministic CLI commands (`npm run lint && npm run build`), paste exact execution evidence and exit code (evidence before assertions), produce step-by-step Manual Verification Guide.
3. **Output**: `QA_REPORT.md` (`QA_STATUS: PASS | FAIL`).
4. **Deterministic Gate**:
   ```bash
   php .agents/scripts/validate-artifact.php --file=.agent-work/<TASK_ID>/QA_REPORT.md --type=qa
   ```
5. **Conditional Edge Decision**:
   ```bash
   php .agents/scripts/manage-state.php --action=set-verdict --task=<TASK_ID> --target=qa --verdict=<PASS|FAIL>
   ```
   - **If FAIL**: Loops back to Node 2 (Implementer).
   - **If PASS**: Transitions to Gate 6 (`WAITING_USER_APPROVAL`).

---

### Step 6: Gate 6 — User Final Verdict Checkpoint
1. **Action**: **STOP AUTOMATION.** Present implementation summary, logic walkthrough, Mermaid diagram, and manual verification guide to user.
2. **Human Decision**:
   - **If user reports issues**: `php .agents/scripts/manage-state.php --action=transition --task=<TASK_ID> --to=node_2_implementation --status=REMEDIATING`
   - **If approved** (`complete`, `approved`, `ship it`): `php .agents/scripts/manage-state.php --action=transition --task=<TASK_ID> --to=node_5_release_manager`

---

### Step 7: Node 5 — Release Manager
1. **Condition**: Verified `STATE.json` has `gate_6_final_verdict: APPROVED`. Apply `verification-before-completion`, `codebase-inventory`.
2. **Action**:
   - Append entry to `MEMORY_ARCHIVE.md` and pointer row to `MEMORY.md`.
   - Run deterministic catalog sync: `php .agents/scripts/sync-catalogs.php`.
   - Conventional commit, push, PR, write `RELEASE_REPORT.md`.
3. **State Complete**:
   ```bash
   php .agents/scripts/manage-state.php --action=transition --task=<TASK_ID> --to=completed --status=COMPLETED
   ```
