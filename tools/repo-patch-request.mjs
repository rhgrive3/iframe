#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const START = '<!-- repo-' + 'patch-request:v1 -->';
const END = '<!-- /repo-' + 'patch-request -->';

export function buildRequest({ branch = 'main', head, message, validation = 'autoflow', operation }) {
  if (!head || !/^[0-9a-f]{40}$/.test(head)) throw new Error('head must be a 40-character lowercase SHA');
  if (!message || /[\r\n]/.test(message)) throw new Error('message must be a single line');
  return {
    target_branch: branch,
    expected_head_sha: head,
    commit_message: message,
    validation,
    operation
  };
}

export function formatIssueBody(request) {
  return `${START}\n${JSON.stringify(request, null, 2)}\n${END}\n`;
}

function currentHead(branch) {
  for (const ref of [`origin/${branch}`, branch, 'HEAD']) {
    try {
      return execFileSync('git', ['rev-parse', ref], { encoding: 'utf8' }).trim();
    } catch {}
  }
  throw new Error(`unable to resolve head for ${branch}`);
}

function value(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

export function parseCli(args) {
  const command = args[0];
  const branch = value(args, '--branch', 'main');
  const head = value(args, '--head') || currentHead(branch);
  const message = value(args, '--message');
  const validation = value(args, '--validation', 'autoflow');

  if (command === 'replace') {
    const path = value(args, '--path');
    const oldFile = value(args, '--old-file');
    const newFile = value(args, '--new-file');
    const expectedCount = Number(value(args, '--count', '1'));
    if (!path || !oldFile || !newFile) throw new Error('replace requires --path, --old-file and --new-file');
    return buildRequest({
      branch, head, message, validation,
      operation: {
        type: 'replace',
        replacements: [{
          path,
          old: readFileSync(oldFile, 'utf8'),
          new: readFileSync(newFile, 'utf8'),
          expected_count: expectedCount
        }]
      }
    });
  }

  if (command === 'diff') {
    const patchFile = value(args, '--patch-file');
    if (!patchFile) throw new Error('diff requires --patch-file');
    return buildRequest({
      branch, head, message, validation,
      operation: { type: 'unified_diff', patch: readFileSync(patchFile, 'utf8') }
    });
  }

  throw new Error('usage: repo-patch-request.mjs replace|diff ...');
}

function main() {
  try {
    const args = process.argv.slice(2);
    const output = value(args, '--output');
    const body = formatIssueBody(parseCli(args));
    if (output) writeFileSync(output, body);
    else process.stdout.write(body);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
