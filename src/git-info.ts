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
    let logOutput: string;
    try {
      const logCommand = `git -C "${repoPath}" log -1 --format="%an|%ae|%aI|%h|%s" --follow -- "${filePath}"`;
      const result = await execAsync(logCommand, {
        maxBuffer: 1024 * 1024,
        stderr: 'ignore'
      });
      logOutput = result.stdout;
    } catch (gitError: any) {
      // File might not exist in git history (new/uncommitted file)
      logger.debug(`[Git] File not in git history (uncommitted or new): ${filePath}`);
      return null;
    }

    if (!logOutput.trim()) {
      logger.debug(`[Git] No git history for file: ${filePath}`);
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
    let commitCount6m = 0;
    try {
      const countCommand = `git -C "${repoPath}" log --since="${churnWindow} months ago" --oneline --follow -- "${filePath}" | wc -l`;
      const countResult = await execAsync(countCommand, {
        maxBuffer: 1024 * 1024,
        stderr: 'ignore'
      });
      commitCount6m = parseInt(countResult.stdout.trim()) || 0;
    } catch (countError) {
      // If count fails, just use 0
      logger.debug(`[Git] Could not get commit count for ${filePath}`);
    }

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

export async function batchCollectGitInfo(
  repoPath: string,
  files: string[],
  churnWindow: number = 6
): Promise<Map<string, GitFileInfo>> {
  const gitInfoMap = new Map<string, GitFileInfo>();

  // If there are too few files, the batch method is overkill and might scan too much history
  if (files.length < 10) {
    return await batchCollectGitInfoSlow(repoPath, files, churnWindow);
  }

  logger.debug(`[Git] Batch collecting metadata for ${files.length} files in ${repoPath}`);

  try {
    // 1. Get last commit info for files
    // We limit the log to avoid scanning the entire history of huge repos
    // 2000 commits should cover most active files in most projects
    const logCommand = `git -C "${repoPath}" log -n 2000 --name-only --pretty=format:"%an|%ae|%aI|%h|%s"`;
    const { stdout } = await execAsync(logCommand, { maxBuffer: 20 * 1024 * 1024 });
    
    const lines = stdout.split('\n');
    const processedFiles = new Set<string>();
    
    let currentCommit: any = null;
    for (const line of lines) {
      if (!line.trim()) continue;
      
      if (line.includes('|')) {
        const parts = line.split('|');
        if (parts.length >= 4) {
          const [author, email, date, hash, ...msgParts] = parts;
          currentCommit = { author, email, date, hash, message: msgParts.join('|') };
        }
      } else {
        // This is a filename
        const relativePath = line.trim();
        const absolutePath = path.join(repoPath, relativePath);
        
        // Only process if it's one of the files we care about and we haven't seen it yet
        if (!processedFiles.has(absolutePath)) {
          gitInfoMap.set(absolutePath, {
            ...currentCommit,
            commitCount6m: 0, 
            churnLevel: 'low'
          });
          processedFiles.add(absolutePath);
        }
      }
    }

    // 2. For any files NOT found in the recent log (e.g. old files), we'll have to get them individually
    const missingFiles = files.filter(f => !processedFiles.has(f));
    if (missingFiles.length > 0 && missingFiles.length < 500) {
      logger.debug(`[Git] ${missingFiles.length} files not found in recent history, fetching individually...`);
      const BATCH_SIZE = 20;
      for (let i = 0; i < missingFiles.length; i += BATCH_SIZE) {
        const batch = missingFiles.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (file) => {
          const rel = path.relative(repoPath, file);
          const info = await getFileGitInfo(repoPath, rel, churnWindow);
          if (info) gitInfoMap.set(file, info);
        }));
      }
    }

    // 3. Churn collection (also limited to avoid CPU hogging)
    // Only collect churn for files we actually found/care about
    const churnCommand = `git -C "${repoPath}" log --since="${churnWindow} months ago" --name-only --pretty=format:""`;
    const { stdout: churnStdout } = await execAsync(churnCommand, { maxBuffer: 20 * 1024 * 1024 });
    
    const fileCommitCounts = new Map<string, number>();
    for (const file of churnStdout.split('\n')) {
      const trimmed = file.trim();
      if (!trimmed) continue;
      const abs = path.join(repoPath, trimmed);
      fileCommitCounts.set(abs, (fileCommitCounts.get(abs) || 0) + 1);
    }

    // 4. Merge churn data
    for (const [absPath, info] of gitInfoMap.entries()) {
      const count = fileCommitCounts.get(absPath) || 0;
      info.commitCount6m = count;
      info.churnLevel = calculateChurnLevel(count);
    }

  } catch (err: any) {
    logger.warn(`[Git] Efficient batch collection failed: ${err.message}`);
    // If we have some data, return it, otherwise fallback
    if (gitInfoMap.size === 0) {
      return await batchCollectGitInfoSlow(repoPath, files, churnWindow);
    }
  }

  logger.info(`[Git] Collected metadata for ${gitInfoMap.size} files`);
  return gitInfoMap;
}

/**
 * Original slower method as fallback
 */
async function batchCollectGitInfoSlow(
  repoPath: string,
  files: string[],
  churnWindow: number = 6
): Promise<Map<string, GitFileInfo>> {
  const gitInfoMap = new Map<string, GitFileInfo>();
  const BATCH_SIZE = 20; // Reduced for fallback
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (file) => {
      const relativePath = path.relative(repoPath, file);
      const info = await getFileGitInfo(repoPath, relativePath, churnWindow);
      if (info) gitInfoMap.set(file, info);
    }));
  }
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
