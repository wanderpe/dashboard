#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * Felix Ambition Framework Evaluator & Self-Improvement Engine (PHP CLI)
 * 
 * Scores task plans, reviews, and artifacts on the 4 dimensions of Ambition:
 * 1. Altitude (Goal Beyond the Goal & Durable Automation)
 * 2. Depth (Specialist Standard & Unreasonable Performance Targets)
 * 3. Range (Operational Verbs & Forensic / Red-Team Review)
 * 4. Outside Judge (Deterministic CLI execution & verification)
 * 
 * Also supports the autonomous self-learning loop:
 *   php evaluate-ambition.php --log-improvement --task=<TASK_ID> --divergence="..." --promoted-rule="..."
 */

function parseArgs(array $argv): array {
    $args = [];
    for ($i = 1; $i < count($argv); $i++) {
        $arg = $argv[$i];
        if (str_starts_with($arg, '--')) {
            $eqPos = strpos($arg, '=');
            if ($eqPos !== false) {
                $args[substr($arg, 2, $eqPos - 2)] = substr($arg, $eqPos + 1);
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

// Check if running self-improvement logging mode
if (!empty($args['log-improvement'])) {
    $taskId = $args['task'] ?? 'general-evolution';
    $divergence = $args['divergence'] ?? 'Unexpected test or review failure';
    $promotedRule = $args['promoted-rule'] ?? null;

    if (!$promotedRule) {
        fwrite(STDERR, "❌ ERROR: --promoted-rule='...' is required when using --log-improvement\n");
        exit(1);
    }

    $logDir = str_replace('\\', '/', getcwd()) . '/.agents';
    $logPath = $logDir . '/AMBITION_LOG.md';

    if (!is_dir($logDir)) {
        mkdir($logDir, 0777, true);
    }

    $timestamp = gmdate('Y-m-d\TH:i:s\Z');
    $entry = "\n## [{$timestamp}] — TASK: {$taskId}\n"
        . "- **Divergence:** {$divergence}\n"
        . "- **Promoted Invariant:** {$promotedRule}\n"
        . "- **Triggered By:** Ambition Framework Self-Improvement Engine\n";

    if (!file_exists($logPath)) {
        file_put_contents($logPath, "# Ambition Framework Self-Improvement Log\n\nPersistent ledger of lessons learned and invariants promoted by the outside judge.\n" . $entry);
    } else {
        file_put_contents($logPath, $entry, FILE_APPEND);
    }

    echo "✅ [Self-Improvement] Successfully logged new invariant to {$logPath}\n";
    echo "   Rule: {$promotedRule}\n";
    exit(0);
}

$targetFile = $args['file'] ?? null;
$taskId = $args['task'] ?? null;

$fileToInspect = null;

if ($targetFile) {
    $fileToInspect = (str_starts_with($targetFile, '/') || preg_match('/^[a-zA-Z]:/', $targetFile))
        ? $targetFile
        : str_replace('\\', '/', getcwd()) . '/' . $targetFile;
} elseif ($taskId) {
    $cwd = str_replace('\\', '/', getcwd());
    $possiblePaths = [
        "{$cwd}/.agent-work/{$taskId}/ARCHITECTURE_PLAN.md",
        "{$cwd}/.agent-work/{$taskId}/QA_REPORT.md",
        "{$cwd}/.agent-work/{$taskId}/TASK_CONTEXT.md",
    ];
    foreach ($possiblePaths as $p) {
        if (file_exists($p)) {
            $fileToInspect = $p;
            break;
        }
    }
}

if (!$fileToInspect || !file_exists($fileToInspect)) {
    echo <<<USAGE

Ambition Framework Evaluator & Self-Improvement Engine
------------------------------------------------------
Usage:
  Evaluate artifact:
    php evaluate-ambition.php --file=<path/to/artifact.md>
    php evaluate-ambition.php --task=<TASK_ID>

  Log self-improvement rule:
    php evaluate-ambition.php --log-improvement --task=<TASK_ID> \
      --divergence="Outside judge failed on Eloquent method" \
      --promoted-rule="❌ BANNED: in-memory filter ➔ ✅ MUST USE: Eloquent where() clause"

USAGE;
    exit(1);
}

$content = strtolower((string)file_get_contents($fileToInspect));

$dimensions = [
    [
        'name' => 'Altitude (Goal Beyond Goal & Durable Automation)',
        'weight' => 25,
        'keywords' => ['altitude', 'goal beyond', 'durable', 'invariant', 'automation', 'permanently', 'monitor'],
        'passed' => false,
        'notes' => ''
    ],
    [
        'name' => 'Depth (Specialist Standard & Unreasonable Targets)',
        'weight' => 25,
        'keywords' => ['depth', 'specialist', 'rawest', 'unreasonable', 'benchmark', 'sub-5ms', 'isolation', 'transaction', 'explain analyze', 'zero n+1'],
        'passed' => false,
        'notes' => ''
    ],
    [
        'name' => 'Range (Operational Verbs & Concurrency Red-Team)',
        'weight' => 25,
        'keywords' => ['verbs', 'operational', 'forensic', 'red team', 'concurrency', 'double-spend', 'race condition', 'idempotency'],
        'passed' => false,
        'notes' => ''
    ],
    [
        'name' => 'The Outside Judge (Deterministic CLI Validation)',
        'weight' => 25,
        'keywords' => ['outside judge', 'php artisan test', 'pest', 'phpunit', 'exit code 0', 'passed in', 'typecheck', 'terminal output'],
        'passed' => false,
        'notes' => ''
    ]
];

$totalScore = 0;

foreach ($dimensions as &$dim) {
    $match = false;
    foreach ($dim['keywords'] as $kw) {
        if (str_contains($content, $kw)) {
            $match = true;
            break;
        }
    }
    $dim['passed'] = $match;
    if ($match) {
        $totalScore += $dim['weight'];
        $dim['notes'] = 'Verified in artifact structure';
    } else {
        $dim['notes'] = 'Missing signals. Expected markers: ' . implode(', ', array_slice($dim['keywords'], 0, 3));
    }
}
unset($dim);

echo "\n======================================================\n";
echo "   FELIX RIESEBERG AMBITION FRAMEWORK EVALUATION      \n";
echo "======================================================\n";
echo "Inspected: {$fileToInspect}\n";
echo "Overall Ambition Score: {$totalScore}/100\n\n";

foreach ($dimensions as $dim) {
    $icon = $dim['passed'] ? '✅ [PASS]' : '⚠️ [WARN]';
    echo "{$icon} {$dim['name']} ({$dim['weight']} pts)\n";
    echo "   {$dim['notes']}\n";
}

echo "\n------------------------------------------------------\n";
if ($totalScore >= 75) {
    echo "🏆 VERDICT: HIGH AMBITION (Enterprise Grade Standards Satisfied)\n";
} elseif ($totalScore >= 50) {
    echo "⚖️ VERDICT: MODERATE AMBITION (Passes baseline, but lacks Depth or Altitude)\n";
} else {
    echo "🚨 VERDICT: LOW AMBITION (Risk of shallow autocomplete. Run /ambition-framework meta-prompt)\n";
}
echo "======================================================\n\n";
exit(0);
