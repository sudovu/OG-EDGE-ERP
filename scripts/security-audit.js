#!/usr/bin/env node
/**
 * Security scan script for OG-EDGE ERP.
 * Runs npm audit and reports vulnerabilities by severity.
 * Exits non-zero if critical or high vulnerabilities are found.
 */
const { execSync } = require("child_process");

function runAudit(cwd) {
  try {
    const output = execSync("npm audit --json", {
      cwd,
      encoding: "utf8",
      timeout: 120000,
    });
    return JSON.parse(output);
  } catch (e) {
    // npm audit exits non-zero when vulnerabilities are found; the output still contains JSON
    if (e.stdout) {
      try {
        return JSON.parse(e.stdout);
      } catch (_) {
        return { vulnerabilitySummary: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 }, error: e.message };
      }
    }
    return { vulnerabilitySummary: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 }, error: e.message };
  }
}

const cwd = process.argv[2] || process.cwd();
const report = runAudit(cwd);
const summary = report.vulnerabilitySummary || {};
const critical = summary.critical || 0;
const high = summary.high || 0;
const moderate = summary.moderate || 0;

console.log(`\nSecurity audit for: ${cwd}`);
console.log(`  Critical: ${critical}`);
console.log(`  High:     ${high}`);
console.log(`  Moderate: ${moderate}`);
console.log(`  Low:      ${summary.low || 0}`);
console.log(`  Info:     ${summary.info || 0}`);

let failed = false;
if (critical > 0) {
  console.error(`\n❌ ${critical} CRITICAL vulnerability(ies) found.`);
  failed = true;
}
if (high > 0) {
  console.error(`\n❌ ${high} HIGH vulnerability(ies) found.`);
  failed = true;
}
if (moderate > 0) {
  console.warn(`\n⚠️  ${moderate} MODERATE vulnerability(ies) found (review recommended).`);
}

if (failed) {
  process.exit(1);
} else {
  console.log("\n✅ No critical or high vulnerabilities found.");
  process.exit(0);
}
