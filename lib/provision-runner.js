// lib/provision-runner.js
// Shared helper to execute scripts/provision.sh via sudo.
// Used by both worker.js (CommonJS) and Next.js API routes (ESM).
//
// Note: worker.js uses its own inline version for CommonJS compat.
// This file is the ESM version for use in API routes.

import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve path to provision.sh relative to this file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROVISION_SCRIPT = path.join(__dirname, '..', 'scripts', 'provision.sh');

/**
 * Run provision.sh with the given arguments.
 * @param {string[]} args - e.g. ['set-ssh-password', 'alice', 'secret']
 * @param {number} [timeout=30000] - timeout in ms
 * @returns {Promise<string>} - stdout + stderr combined
 */
export function runProvision(args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    execFile('sudo', [PROVISION_SCRIPT, ...args], { timeout }, (err, stdout, stderr) => {
      const output = (stdout + stderr).trim();
      if (err) {
        reject(new Error(output || err.message));
      } else {
        resolve(output);
      }
    });
  });
}
