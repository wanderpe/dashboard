#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * Deterministic Artifact Schema Validator (PHP CLI)
 *
 * Validates handoff markdown artifacts against defined schema headers and verdicts.
 * Zero external runtime dependencies. Runs locally on PHP 8.2+.
 *
 * Usage:
 *   php .agents/scripts/validate-artifact.php --file=.agent-work/TASK-123/ARCHITECTURE_PLAN.md --type=architecture
 */

function parseArgs(array $argv): array {
    $args = [];
    for ($i = 1; $i < count($argv); $i++) {
        $arg = $argv[$i];
        if (str_starts_with($arg, '--')) {
            $eqPos = strpos($arg, '=');
            if ($eqPos !== false) {
                $key = substr($arg, 2, $eqPos - 2);
                $val = substr($arg, $eqPos + 1);
                $args[$key] = $val;
            } else {
                $key = substr($arg, 2);
                $next = $argv[$i + 1] ?? null;
                if ($next !== null && !str_starts_with($next, '--')) {
                    $args[$key] = $next;
                    $i++;
                } else {
                    $args[$key] = 'true';
                }
            }
        }
    }
    return $args;
}

$args = parseArgs($argv);
$filePath = $args['file'] ?? null;
$type = $args['type'] ?? null;

if (!$filePath || !$type) {
    fwrite(STDERR, "❌ Usage: php validate-artifact.php --file=<path> --type=<task_context|architecture|implementation_plan|code_review|qa|release>\n");
    exit(1);
}

$resolvedPath = (str_starts_with($filePath, '/') || preg_match('/^[a-zA-Z]:/', $filePath))
    ? $filePath
    : getcwd() . '/' . $filePath;

if (!file_exists($resolvedPath)) {
    fwrite(STDERR, "❌ ERROR: File not found: {$resolvedPath}\n");
    exit(1);
}

$content = file_get_contents($resolvedPath);
if ($content === false || trim($content) === '') {
    fwrite(STDERR, "❌ ERROR: File is empty: {$resolvedPath}\n");
    exit(1);
}

$schemas = [
    'task_context' => [
        'required_headers' => [
            '/^##\s+(?:\d+\.\s+)?Feature/mi' => '## Feature (or ## 1. Feature Scope)',
            '/^##\s+(?:\d+\.\s+)?(?:Business Goal|Feature Scope & Business Goal)/mi' => '## Business Goal',
            '/^##\s+(?:\d+\.\s+)?Actors/mi' => '## Actors & Permissions',
            '/^##\s+(?:\d+\.\s+)?(?:Requirements|Core Requirements)/mi' => '## Requirements',
            '/^##\s+(?:\d+\.\s+)?Constraints/mi' => '## Constraints',
        ],
        'required_patterns' => [
            '/TASK_ID/i' => 'TASK_ID declaration',
        ],
    ],
    'architecture' => [
        'required_headers' => [
            '/^##\s+(?:\d+\.\s+)?Architecture/mi' => '## Architecture Summary',
            '/^##\s+(?:\d+\.\s+)?Reused/mi' => '## Reused Components',
            '/^##\s+(?:\d+\.\s+)?(?:Database|Schema|Data Model)/mi' => '## Database Schema Changes',
            '/^##\s+(?:\d+\.\s+)?(?:Security|Tenancy)/mi' => '## Security & Tenancy',
            '/^##\s+(?:\d+\.\s+)?QA Risk/mi' => '## QA Risk Matrix',
        ],
        'required_patterns' => [
            '/TASK-[0-9]{3}/i' => 'At least one task ID (e.g. TASK-001)',
        ],
    ],
    'implementation_plan' => [
        'required_headers' => [
            '/^##\s+(?:\d+\.\s+)?Implementation Summary/mi' => '## Implementation Summary',
            '/^##\s+(?:\d+\.\s+)?Files to Create/mi' => '## Files to Create',
            '/^##\s+(?:\d+\.\s+)?Files to Modify/mi' => '## Files to Modify',
            '/^##\s+(?:\d+\.\s+)?Implementation Order/mi' => '## Implementation Order',
        ],
        'required_patterns' => [],
    ],
    'code_review' => [
        'required_headers' => [
            '/^##\s+(?:\d+\.\s+)?(?:Overall Status|CODE_REVIEW_STATUS)/mi' => '## Overall Status',
            '/^##\s+(?:\d+\.\s+)?Findings/mi' => '## Findings',
            '/^##\s+(?:\d+\.\s+)?Architecture Compliance/mi' => '## Architecture Compliance',
            '/^##\s+(?:\d+\.\s+)?(?:Backward Compatibility|Backward Compatibility & Legacy Invariant Assessment)/mi' => '## Backward Compatibility & Legacy Invariant Assessment',
            '/^##\s+(?:\d+\.\s+)?(?:Mermaid Diagram|Sequence Diagram)/mi' => '## Mermaid Diagram',
        ],
        'required_patterns' => [
            '/(?:CODE_REVIEW_STATUS|Overall Status|Reviewer Verdict):\s*(?:PASS|FAIL)/i' => 'Explicit PASS/FAIL verdict status',
        ],
    ],
    'qa' => [
        'required_headers' => [
            '/^##\s+(?:\d+\.\s+)?(?:QA Status|QA_STATUS)/mi' => '## QA Status',
            '/^##\s+(?:\d+\.\s+)?(?:Requirement Validation|Automated Test Results|Test Execution)/mi' => '## Requirement Validation (or ## Automated Test Results)',
            '/^##\s+(?:\d+\.\s+)?Acceptance Criteria/mi' => '## Acceptance Criteria',
            '/^##\s+(?:\d+\.\s+)?(?:Backward Compatibility|Backward Compatibility & Legacy Invariant Verification)/mi' => '## Backward Compatibility & Legacy Invariant Verification',
            '/^##\s+(?:\d+\.\s+)?Manual Verification Guide/mi' => '## Manual Verification Guide',
        ],
        'required_patterns' => [
            '/(?:QA_STATUS|QA Status|Final QA Verdict):\s*(?:PASS|FAIL)/i' => 'Explicit PASS/FAIL QA status',
            '/(?:vitest|passed|passing|php artisan test|phpunit|pest|Test >|assertions|\d+\s+passing|\d+\s+passed)/i' => 'Recorded automated test evidence (PHPUnit / Pest / php artisan test output, assertions count, or test evidence)',
        ],
    ],
    'release' => [
        'required_headers' => [
            '/^##\s+(?:\d+\.\s+)?User Approval/mi' => '## User Approval',
            '/^##\s+(?:\d+\.\s+)?Documentation Updated/mi' => '## Documentation Updated',
            '/^##\s+(?:\d+\.\s+)?MEMORY\.md Updated/mi' => '## MEMORY.md Updated',
            '/^##\s+(?:\d+\.\s+)?Commit/mi' => '## Commit',
        ],
        'required_patterns' => [],
    ],
];

if (!isset($schemas[$type])) {
    fwrite(STDERR, "❌ ERROR: Unknown schema type '{$type}'. Supported: " . implode(', ', array_keys($schemas)) . "\n");
    exit(1);
}

$schema = $schemas[$type];
$errors = [];

// 1. Validate mandatory headers using regex
foreach ($schema['required_headers'] as $regex => $label) {
    if (!preg_match($regex, $content)) {
        $errors[] = "Missing mandatory section: '{$label}'";
    }
}

// 2. Validate mandatory regex patterns
foreach ($schema['required_patterns'] as $regex => $description) {
    if (!preg_match($regex, $content)) {
        $errors[] = "Missing required pattern: {$description}";
    }
}

// 3. Output results
if (!empty($errors)) {
    fwrite(STDERR, "❌ SCHEMA VALIDATION FAILED for [{$type}] ({$filePath}):\n");
    foreach ($errors as $err) {
        fwrite(STDERR, "   • {$err}\n");
    }
    exit(1);
}

echo "✅ Artifact schema [{$type}] verified successfully: {$filePath}\n";
exit(0);
