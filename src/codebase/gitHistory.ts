import * as vscode from 'vscode';
import { exec } from 'child_process';
import type { GitCommit } from './codebaseTypes';

/**
 * Retrieves git history for the workspace root.
 * Falls back gracefully if git is not available.
 */
export function getGitHistory(rootPath: string, maxCommits = 100): Promise<GitCommit[]> {
  return new Promise((resolve) => {
    const format = '--format=%H|||%s|||%an|||%aI|||%x00';
    const cmd = `git log --shortstat ${format} -n ${maxCommits}`;

    exec(cmd, { cwd: rootPath, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) {
        resolve([]);
        return;
      }

      const commits: GitCommit[] = [];
      // Split by null byte separator
      const entries = stdout.split('\0').filter((e) => e.trim());

      for (const entry of entries) {
        const lines = entry.trim().split('\n').filter((l) => l);
        // First line should be the formatted log line
        const logLine = lines.find((l) => l.includes('|||'));
        if (!logLine) continue;

        const parts = logLine.split('|||');
        if (parts.length < 4) continue;

        // Stats line (if present)
        const statsLine = lines.find((l) => l.includes('insertion') || l.includes('deletion') || l.includes('changed'));
        let filesChanged = 0;
        if (statsLine) {
          const filesMatch = statsLine.match(/(\d+)\s+file/);
          if (filesMatch) filesChanged = parseInt(filesMatch[1], 10);
        }

        commits.push({
          hash: parts[0].trim(),
          message: parts[1].trim(),
          author: parts[2].trim(),
          date: parts[3].trim(),
          filesChanged,
        });
      }

      resolve(commits);
    });
  });
}
