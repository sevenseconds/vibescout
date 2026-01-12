import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { logger } from './logger.js';

const execAsync = promisify(exec);

export interface GitFileInfo {
  author: string;
  email: string;
  date: string;
  hash: string;
  message: string;
  commitCount6m: number;
  churnLevel: 'low' | 'medium' | 'high';
}

// In-memory cache for git info: Map<projectPath, Map<filePath, GitFileInfo>>
const gitCache = new Map<string, Map<string, GitFileInfo>>();

/**
 * Check if a directory is a git repository
 * @param projectPath Absolute path to the project directory
 * @returns Git repository root path, or null if not a git repo
 */
export async function initGitRepo(projectPath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`git -C "${projectPath}" rev-parse --show-toplevel`, {
      maxBuffer: 1024 * 1024
    });
    const gitRoot = stdout.trim();
    logger.debug(`[Git] Repository root: ${gitRoot}`);
    return gitRoot;
  } catch (error: any) {
    logger.debug(`[Git] Not a git repository: ${projectPath}`);
    return null;
  }
}

/**
 * Calculate churn level based on commit count
 * @param commitCount Number of commits in the time window
 * @returns Churn level: low (0-3), medium (4-10), high (11+)
 */
function calculateChurnLevel(commitCount: number): 'low' | 'medium' | 'high' {
  if (commitCount <= 3) return 'low';
  if (commitCount <= 10) return 'medium';
  return 'high';
}

/**
 * Get git info for a single file
 * @param repoPath Git repository root path
 * @param filePath Relative path to the file from repository root
 * @param churnWindow Number of months to calculate churn (default: 6)
 * @returns Git file info, or null if file not in git
 */
export async function getFileGitInfo(
  repoPath: string,
  filePath: string,
  churnWindow: number = 6
): Promise<GitFileInfo | null> {
  // Check cache first
  const cacheKey = repoPath;
  if (gitCache.has(cacheKey)) {
    const fileCache = gitCache.get(cacheKey)!;
    if (fileCache.has(filePath)) {
      return fileCache.get(filePath)!;
    }
  }

  try {
    // Get last commit info
    const logCommand = `git -C "${repoPath}" log -1 --format="%an|%ae|%aI|%h|%s" --follow -- "${filePath}"`;
    const { stdout: logOutput } = await execAsync(logCommand, {
      maxBuffer: 1024 * 1024
    });

    if (!logOutput.trim()) {
      logger.debug(`[Git] File not in git: ${filePath}`);
      return null;
    }

    const parts = logOutput.trim().split('|');
    if (parts.length < 5) {
      logger.warn(`[Git] Invalid git log output for ${filePath}`);
      return null;
    }

    const [author, email, date, hash, ...messageParts] = parts;
    const message = messageParts.join('|'); // Rejoin in case message contains |

    // Get commit count in the specified time window
    const countCommand = `git -C "${repoPath}" log --since="${churnWindow} months ago" --oneline --follow -- "${filePath}" | wc -l`;
    const { stdout: countOutput } = await execAsync(countCommand, {
      maxBuffer: 1024 * 1024
    });

    const commitCount6m = parseInt(countOutput.trim()) || 0;
    const churnLevel = calculateChurnLevel(commitCount6m);

    const gitInfo: GitFileInfo = {
      author,
      email,
      date,
      hash,
      message,
      commitCount6m,
      churnLevel
    };

    // Cache the result
    if (!gitCache.has(cacheKey)) {
      gitCache.set(cacheKey, new Map());
    }
    gitCache.get(cacheKey)!.set(filePath, gitInfo);

    return gitInfo;
  } catch (error: any) {
    logger.debug(`[Git] Failed to get git info for ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Batch collect git info for multiple files (performance optimization)
 * @param repoPath Git repository root path
 * @param files Array of absolute file paths
 * @param churnWindow Number of months to calculate churn (default: 6)
 * @returns Map of relative file paths to git info
 */
export async function batchCollectGitInfo(
  repoPath: string,
  files: string[],
  churnWindow: number = 6
): Promise<Map<string, GitFileInfo>> {
  const gitInfoMap = new Map<string, GitFileInfo>();

  logger.debug(`[Git] Collecting metadata for ${files.length} files...`);

  // Process files in parallel batches for better performance
  const BATCH_SIZE = 50;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (file) => {
        try {
          // Convert absolute path to relative path from repo root
          let relativePath: string;
          try {
            relativePath = path.relative(repoPath, file);
          } catch (pathErr) {
            logger.debug(`[Git] path.relative failed for ${file}: ${pathErr.message}`);
            // Fallback: use basename if relative path fails
            relativePath = path.basename(file);
          }

          // Additional safety: validate relative path
          if (!relativePath || relativePath.startsWith('..')) {
            logger.debug(`[Git] Invalid relative path for ${file}: ${relativePath}`);
            return; // Skip this file
          }

          const gitInfo = await getFileGitInfo(repoPath, relativePath, churnWindow);
          if (gitInfo) {
            // Store with ABSOLUTE path as key (more reliable than relative paths)
            gitInfoMap.set(file, gitInfo);
          }
        } catch (err) {
          logger.debug(`[Git] Failed to process ${file}: ${err.message}`);
          // Continue processing other files
        }
      })
    );

    // Log progress for large batches
    if (files.length > BATCH_SIZE) {
      const processed = Math.min(i + BATCH_SIZE, files.length);
      logger.debug(`[Git] Processed ${processed}/${files.length} files`);
    }
  }

  logger.info(`[Git] Collected metadata for ${gitInfoMap.size}/${files.length} files`);

  return gitInfoMap;
}

/**
 * Clear git cache for a specific project
 * @param repoPath Git repository root path
 */
export function clearGitCache(repoPath?: string): void {
  if (repoPath) {
    gitCache.delete(repoPath);
    logger.debug(`[Git] Cleared cache for ${repoPath}`);
  } else {
    gitCache.clear();
    logger.debug('[Git] Cleared all git caches');
  }
}
