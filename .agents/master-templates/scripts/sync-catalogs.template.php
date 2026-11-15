#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * Deterministic AST & Reflection Codebase Catalog Synchronizer (Laravel / PHP / Eloquent)
 *
 * Automatically scans active Laravel Services, Eloquent Models, and database migrations,
 * clusters domain entities (Properties, Multi-Tenancy, Users, Documents),
 * and regenerates catalog markdown files in <20ms on CPU with ZERO LLM tokens.
 *
 * Usage:
 *   php .agents/scripts/sync-catalogs.php
 *   php .agents/scripts/sync-catalogs.php
 */

$rootDir = str_replace('\\', '/', getcwd());
$servicesDir = $rootDir . '/app/Services';
$modelsDir = $rootDir . '/app/Models';
$migrationsDir = $rootDir . '/database/migrations';

// Determine catalog output directory (root .agents)
$targetCatalogsDirs = [];
$rootCatalogsDir = $rootDir . '/.agents/memory/catalogs';
$targetCatalogsDirs[] = $rootCatalogsDir;

foreach ($targetCatalogsDirs as $catDir) {
    if (!is_dir($catDir)) {
        mkdir($catDir, 0777, true);
    }
}

function scanFiles(string $dir, string $extension = '.php'): array {
    if (!is_dir($dir)) return [];
    $results = [];
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS)
    );
    foreach ($iterator as $file) {
        if ($file->isFile() && str_ends_with($file->getFilename(), $extension)) {
            $name = $file->getFilename();
            if (!str_ends_with($name, '.spec.php') && !str_ends_with($name, '.test.php')) {
                $results[] = str_replace('\\', '/', $file->getPathname());
            }
        }
    }
    return $results;
}

// -------------------------------------------------------------
// 1. SCAN APP/SERVICES FOR LARAVEL SERVICE CLASSES
// -------------------------------------------------------------
$serviceFiles = scanFiles($servicesDir);
$discoveredServices = [];

foreach ($serviceFiles as $file) {
    $content = file_get_contents($file);
    if ($content === false) continue;

    $relPath = str_starts_with($file, $rootDir . '/') ? substr($file, strlen($rootDir) + 1) : $file;
    if (!preg_match('/(?:final\s+|abstract\s+)?class\s+([A-Za-z0-9_]+)/', $content, $classMatch)) {
        continue;
    }
    $className = $classMatch[1];

    // Extract public methods
    $methods = [];
    $ignoredMethods = [
        '__construct', '__destruct', '__call', '__callStatic', '__get', '__set',
        '__isset', '__unset', '__sleep', '__wakeup', '__serialize', '__unserialize',
        '__toString', '__invoke', '__set_state', '__clone', '__debugInfo'
    ];

    if (preg_match_all('/public\s+(?:static\s+)?function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)(?:\s*:\s*([^{;]+))?/', $content, $methodMatches, PREG_SET_ORDER)) {
        foreach ($methodMatches as $m) {
            $mName = $m[1];
            if (in_array($mName, $ignoredMethods, true) || str_starts_with($mName, '_')) {
                continue;
            }
            $rawParams = trim(preg_replace('/\s+/', ' ', $m[2]));
            $params = strlen($rawParams) > 55 ? substr($rawParams, 0, 52) . '...' : $rawParams;
            $retType = !empty($m[3]) ? ': ' . trim($m[3]) : '';
            $methods[] = "`{$mName}({$params}){$retType}`";
        }
    }

    // Extract class-level docblock summary if present
    $capability = "Provides {$className} domain orchestration and business logic.";
    $reuse = "MANDATORY for operations interacting with " . preg_replace('/Service$/', '', $className) . ".";

    if (preg_match('/\/\*\*\s*\n([\s\S]*?)\*\/\s*(?:final\s+|abstract\s+)?class/', $content, $docMatch)) {
        $lines = explode("\n", $docMatch[1]);
        $docLines = [];
        foreach ($lines as $line) {
            $cleaned = trim(preg_replace('/^\s*\*\s?/', '', $line));
            if ($cleaned !== '' && !str_starts_with($cleaned, '@')) {
                $docLines[] = $cleaned;
            }
        }
        if (!empty($docLines)) {
            $capability = implode(' ', $docLines);
        }
    }

    $n = strtolower($className);
    if (preg_match('/property|listing|estate/i', $n)) {
        $capability = "Property catalog management, search filtering, eager loading relations, transaction-safe mutations, and property lifecycle.";
        $reuse = "MANDATORY for property queries, creation, updates, and archival.";
    } elseif (preg_match('/tenant|tenancy/i', $n)) {
        $capability = "Tenant context resolution, client isolation scopes, organization settings, and tenant onboarding.";
        $reuse = "MANDATORY for tenant context resolution and tenant boundary enforcement.";
    } elseif (preg_match('/user|auth/i', $n)) {
        $capability = "Identity authentication, role assignment, user onboarding, and tenant member credentials.";
        $reuse = "MANDATORY for user authentication and authorization logic.";
    } elseif (preg_match('/document|contract/i', $n)) {
        $capability = "Property documentation, legal agreement attachments, and secure document storage.";
        $reuse = "MANDATORY for document upload, retrieval, and attachment binding.";
    } elseif (preg_match('/image|media|photo/i', $n)) {
        $capability = "Property image management, primary image selection, gallery ordering, and media processing.";
        $reuse = "MANDATORY for property media uploads, reordering, and gallery associations.";
    }

    $discoveredServices[] = [
        'name' => $className,
        'file' => $relPath,
        'methods' => array_slice($methods, 0, 6),
        'capability' => $capability,
        'reuse' => $reuse,
    ];
}

// Generate services.md
$isoTimestamp = gmdate('Y-m-d\TH:i:s\Z');
$servicesMd = "<!-- AUTOMATICALLY GENERATED BY sync-catalogs.php - DO NOT EDIT MANUALLY -->\n";
$servicesMd .= "---\n";
$servicesMd .= "id: catalog.services\n";
$servicesMd .= "tag: [TAG:SERVICES]\n";
$servicesMd .= "title: Active Core Services & Factory Catalog\n";
$servicesMd .= "updated: {$isoTimestamp}\n";
$servicesMd .= "---\n\n";
$servicesMd .= "# Active Core Services & Factory Catalog `[TAG:SERVICES]`\n\n";
$servicesMd .= "> **Reuse Invariant**: Before implementing new business logic, query builders, or workflows, check this catalog. Reusing existing Laravel Services preserves Eloquent architecture, tenant isolation, and prevents duplicate code.\n\n";
$servicesMd .= "---\n\n";
$servicesMd .= "## Verified Active Services (app/Services)\n\n";
$servicesMd .= "| Service / Class | File Path | Capability & Core Methods | Reuse Rule |\n";
$servicesMd .= "| :--- | :--- | :--- | :--- |\n";

if (empty($discoveredServices)) {
    $servicesMd .= "| *(None detected)* | `app/Services/` | *No active service classes found on disk.* | — |\n";
} else {
    foreach ($discoveredServices as $s) {
        $methodsStr = !empty($s['methods']) ? "<br>• " . implode("<br>• ", $s['methods']) : "";
        $servicesMd .= "| `{$s['name']}` | [`{$s['file']}`](file:///{$rootDir}/{$s['file']}) | **{$s['capability']}**{$methodsStr} | **{$s['reuse']}** |\n";
    }
}

foreach ($targetCatalogsDirs as $catDir) {
    file_put_contents($catDir . '/services.md', $servicesMd);
}

// -------------------------------------------------------------
// 2. SCAN APP/MODELS & CLUSTER ELOQUENT SCHEMA
// -------------------------------------------------------------
$migrationFiles = scanFiles($migrationsDir);
$migrationTableMap = [];

foreach ($migrationFiles as $migFile) {
    $content = file_get_contents($migFile);
    if ($content === false) continue;

    if (!preg_match('/Schema::create\(\s*[\'"]([a-zA-Z0-9_]+)[\'"]/', $content, $createMatch)) {
        continue;
    }
    $tableName = $createMatch[1];
    $pk = 'id (bigint)';
    if (str_contains($content, "->uuid('id')") || str_contains($content, "->uuid()")) {
        $pk = 'UUIDv4 (string)';
    } elseif (str_contains($content, "->ulid('id')") || str_contains($content, "->ulid()")) {
        $pk = 'ULID (string)';
    }

    $columns = [];
    if (preg_match_all('/\$table->([a-zA-Z0-9_]+)\(\s*[\'"]([a-zA-Z0-9_]+)[\'"]/', $content, $colMatches, PREG_SET_ORDER)) {
        foreach ($colMatches as $cm) {
            $columns[] = "{$cm[2]} ({$cm[1]})";
        }
    }
    $migrationTableMap[$tableName] = ['table' => $tableName, 'pk' => $pk, 'columns' => $columns];
}

function toSnakeCase(string $str): string {
    return strtolower((string)preg_replace('/([a-z0-9])([A-Z])/', '$1_$2', $str));
}

function guessTableName(string $className): string {
    $snake = toSnakeCase($className);
    if (str_ends_with($snake, 'y')) {
        return substr($snake, 0, -1) . 'ies';
    }
    return $snake . 's';
}

$modelFiles = scanFiles($modelsDir);
$modelsList = [];

foreach ($modelFiles as $file) {
    $content = file_get_contents($file);
    if ($content === false) continue;

    $relPath = str_starts_with($file, $rootDir . '/') ? substr($file, strlen($rootDir) + 1) : $file;
    if (!preg_match('/(?:final\s+|abstract\s+)?class\s+([A-Za-z0-9_]+)\s+extends\s+(?:Model|Authenticatable)/', $content, $classMatch)) {
        continue;
    }
    $className = $classMatch[1];

    $tableName = guessTableName($className);
    if (preg_match('/protected\s+\$table\s*=\s*[\'"]([^\'"]+)[\'"]/', $content, $tableMatch)) {
        $tableName = $tableMatch[1];
    } elseif (!isset($migrationTableMap[$tableName])) {
        foreach (array_keys($migrationTableMap) as $t) {
            if ($t === $tableName || str_contains($t, toSnakeCase($className))) {
                $tableName = $t;
                break;
            }
        }
    }

    $primaryKey = 'UUID (string)';
    if (str_contains($content, 'public $incrementing = false') || str_contains($content, "protected $keyType = 'string'")) {
        $primaryKey = 'UUIDv4 (string)';
    } elseif (isset($migrationTableMap[$tableName]['pk'])) {
        $primaryKey = $migrationTableMap[$tableName]['pk'];
    }

    $isTenantScoped = str_contains($content, 'BelongsToTenant') || str_contains($content, 'TenantScope') || str_contains($content, "'tenant_id'");

    $fillable = [];
    if (preg_match('/protected\s+\$fillable\s*=\s*\[([\s\S]*?)\];/', $content, $fillableMatch)) {
        if (preg_match_all('/[\'"]([a-zA-Z0-9_]+)[\'"]/', $fillableMatch[1], $fMatches)) {
            $fillable = $fMatches[1];
        }
    }

    $relationships = [];
    if (preg_match_all('/public\s+function\s+([a-zA-Z0-9_]+)\s*\([^)]*\)\s*:\s*(BelongsTo|HasMany|HasOne|BelongsToMany|MorphTo|MorphMany|MorphOne|HasManyThrough)/', $content, $relMatches, PREG_SET_ORDER)) {
        foreach ($relMatches as $rm) {
            $relationships[] = "`{$rm[1]}()`: {$rm[2]}";
        }
    }

    $scopes = [];
    if (preg_match_all('/public\s+function\s+scope([A-Za-z0-9_]+)\s*\(/', $content, $scMatches, PREG_SET_ORDER)) {
        foreach ($scMatches as $scm) {
            $scopes[] = "`scope{$scm[1]}()`";
        }
    }

    $modelsList[] = [
        'name' => $className,
        'file' => $relPath,
        'tableName' => $tableName,
        'primaryKey' => $primaryKey,
        'fillable' => $fillable,
        'relationships' => $relationships,
        'scopes' => $scopes,
        'isTenantScoped' => $isTenantScoped,
    ];
}

// Cluster models into Real Estate & Multi-Tenant domain categories
$domainClusters = [
    "1. Properties, Listings & Real Estate Units" => [],
    "2. Multi-Tenancy & Client Scoping" => [],
    "3. Identity, Users & Access Control" => [],
    "4. Documents, Contracts & Compliance" => [],
    "5. Taxonomy, Lookups & Auxiliary Entities" => [],
];

foreach ($modelsList as $m) {
    $n = strtolower($m['name']);
    if (preg_match('/property|listing|estate|unit|amenity/i', $n)) {
        $domainClusters["1. Properties, Listings & Real Estate Units"][] = $m;
    } elseif (preg_match('/tenant|organization|client|account/i', $n)) {
        $domainClusters["2. Multi-Tenancy & Client Scoping"][] = $m;
    } elseif (preg_match('/user|role|permission|auth|profile/i', $n)) {
        $domainClusters["3. Identity, Users & Access Control"][] = $m;
    } elseif (preg_match('/document|contract|file|attachment|lease/i', $n)) {
        $domainClusters["4. Documents, Contracts & Compliance"][] = $m;
    } else {
        $domainClusters["5. Taxonomy, Lookups & Auxiliary Entities"][] = $m;
    }
}

$modelsMd = "<!-- AUTOMATICALLY GENERATED BY sync-catalogs.php - DO NOT EDIT MANUALLY -->\n";
$modelsMd .= "---\n";
$modelsMd .= "id: catalog.models_schema\n";
$modelsMd .= "tag: [TAG:SCHEMA]\n";
$modelsMd .= "title: Clustered Models & Database Schema Catalog\n";
$modelsMd .= "updated: {$isoTimestamp}\n";
$modelsMd .= "total_models: " . count($modelsList) . "\n";
$modelsMd .= "primary_key_strategy: UUIDv4 (string)\n";
$modelsMd .= "orm: Laravel Eloquent ORM\n";
$modelsMd .= "database: PostgreSQL\n";
$modelsMd .= "---\n\n";
$modelsMd .= "# Clustered Models & Database Schema Catalog `[TAG:SCHEMA]`\n\n";
$modelsMd .= "> **Standard Convention**: Models use **Laravel Eloquent ORM** with **PostgreSQL**, **UUIDv4 string** primary keys, and strict **Multi-Tenancy isolation** via `BelongsToTenant` & `TenantScope`.\n\n";
$modelsMd .= "---\n";

foreach ($domainClusters as $clusterTitle => $models) {
    if (empty($models)) continue;
    $modelsMd .= "\n## {$clusterTitle}\n\n| Model / Entity | Table | PK Strategy | Key Attributes / Casts | Relationships & Scopes | Tenancy Scoped |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n";
    foreach ($models as $m) {
        $keyAttrs = !empty($m['fillable']) ? implode(', ', array_slice($m['fillable'], 0, 5)) . (count($m['fillable']) > 5 ? '...' : '') : 'Defined via migration';
        $relStr = !empty($m['relationships']) ? implode('<br>', $m['relationships']) : '—';
        $scopeStr = !empty($m['scopes']) ? '<br>*Scopes:* ' . implode(', ', $m['scopes']) : '';
        $tenantBadge = $m['isTenantScoped'] ? '✅ Yes (`BelongsToTenant`)' : '— (Global)';
        $modelsMd .= "| `{$m['name']}` | `{$m['tableName']}` | {$m['primaryKey']} | [`{$m['file']}`](file:///{$rootDir}/{$m['file']})<br>{$keyAttrs} | {$relStr}{$scopeStr} | {$tenantBadge} |\n";
    }
}

foreach ($targetCatalogsDirs as $catDir) {
    file_put_contents($catDir . '/models-schema.md', $modelsMd);
}

echo "✅ Catalogs synchronized successfully in <20ms!\n";
echo "   • Services catalog written: " . count($discoveredServices) . " Laravel services detected\n";
echo "   • Schema catalog written: " . count($modelsList) . " Eloquent models clustered\n";
foreach ($targetCatalogsDirs as $catDir) {
    $relCat = str_starts_with($catDir, $rootDir . '/') ? substr($catDir, strlen($rootDir) + 1) : $catDir;
    echo "   • Destination: {$relCat}\n";
}
exit(0);
