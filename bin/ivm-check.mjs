#!/usr/bin/env node
/**
 * ivm check — validate ```ivm fences in a Markdown file (or stdin).
 *
 * Usage:
 *   ivm-check [--json] [file.md]
 *   cat doc.md | ivm-check --json
 *
 * Exit 1 when any error-severity diagnostic is present (warnings alone → 0).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { diagnoseMarkdown, formatDiagnostic } from "../src/diagnostics.js";

function usage(code = 0) {
  const msg = `Usage: ivm-check [--json] [file.md]

Validate Interactive Markdown \`\`\`ivm fences.
Reads stdin when no file is given.

Options:
  --json   Print machine-readable diagnostics JSON
  -h, --help
`;
  if (code) console.error(msg);
  else console.log(msg);
  process.exit(code);
}

function parseArgs(argv) {
  /** @type {{ json: boolean, file: string|null, help: boolean }} */
  const opts = { json: false, file: null, help: false };
  for (const a of argv) {
    if (a === "--json") opts.json = true;
    else if (a === "-h" || a === "--help") opts.help = true;
    else if (a.startsWith("-")) {
      console.error(`Unknown option: ${a}`);
      usage(2);
    } else opts.file = a;
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) usage(0);

  let source;
  let fileLabel = opts.file || "<stdin>";
  if (opts.file) {
    const abs = resolve(opts.file);
    source = readFileSync(abs, "utf8");
    fileLabel = opts.file;
  } else {
    source = readFileSync(0, "utf8");
  }

  const result = diagnoseMarkdown(source, { file: fileLabel });

  if (opts.json) {
    const payload = {
      file: fileLabel,
      fenceCount: result.fenceCount,
      errorCount: result.errorCount,
      warningCount: result.warningCount,
      diagnostics: result.diagnostics.map((d) => ({
        file: d.file ?? fileLabel,
        fence: d.fence ?? null,
        line: d.line ?? null,
        severity: d.severity,
        code: d.code,
        message: d.message,
        hint: d.hint ?? null,
      })),
    };
    console.log(JSON.stringify(payload, null, 2));
  } else {
    if (result.fenceCount === 0) {
      console.log(`${fileLabel}: no \`\`\`ivm fences`);
    } else {
      console.log(
        `${fileLabel}: ${result.fenceCount} fence(s), ${result.errorCount} error(s), ${result.warningCount} warning(s)`
      );
    }
    for (const d of result.diagnostics) {
      const line = formatDiagnostic(d);
      if (d.severity === "error") console.error(line);
      else console.log(line);
    }
  }

  process.exit(result.errorCount > 0 ? 1 : 0);
}

main();
