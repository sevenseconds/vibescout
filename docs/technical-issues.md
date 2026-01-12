# Technical Issues and Solutions

This document tracks technical issues encountered during development and their solutions.

## CLI Hanging on Plugin and Management Commands

### Issue
When running CLI commands like `plugin list`, `reset`, or `compact`, the application would hang indefinitely. The commands triggered unnecessary file watching and indexing of the entire project.

### Root Cause
The `preAction` hook in `src/index.js` unconditionally initialized all services (providers, database, file watcher) for every command, including lightweight management commands that don't need them.

File watcher initialization (`initWatcher()`) was particularly problematic because it:
1. Scans all files in watched projects
2. Triggers initial indexing
3. Starts background polling (for projects with >3000 files)

### Solution
Modified the `preAction` hook to categorize commands and conditionally initialize services:

**Category 1: No Initialization**
- Commands: `config`, `plugin`
- Skip: Providers, database, watcher
- Reason: These are pure management commands that only read config or manage plugins

**Category 2: Database/Providers Only**
- Commands: `compact`, `reset`, `index`, `search`
- Initialize: Providers, database
- Skip: File watcher
- Reason: These need data access but not real-time file watching

**Category 3: Full Initialization**
- Commands: `ui`, server modes (default action)
- Initialize: Everything including file watcher
- Reason: Server modes need real-time file watching for automatic re-indexing

### Implementation Details

File: `src/index.js`

```javascript
program.hook("preAction", async (thisCommand) => {
  // ... logger setup ...

  // Parse command from process.argv (skip options like --verbose)
  const args = process.argv.slice(2);
  const firstCommand = args.find(arg => !arg.startsWith('--'));

  // Command categorization
  const noInitCommands = ['config', 'plugin'];
  const needsNoInit = noInitCommands.includes(firstCommand);

  const noWatcherCommands = ['compact', 'reset', 'index', 'search'];
  const needsWatcher = !noWatcherCommands.includes(firstCommand) && !needsNoInit;

  // Initialize plugin system (needed for plugin commands)
  if (opts.plugins !== false) {
    const registry = getRegistry();
    await registry.loadAll(config.plugin || {});
  }

  // Skip all heavy initialization for config and plugin commands
  if (needsNoInit) {
    return;
  }

  // Initialize providers and database for most commands
  configureEnvironment(opts.modelsPath, opts.offline);
  await embeddingManager.setProvider(providerConfig, config.throttlingErrors);
  await summarizerManager.setProvider(llmConfig, config.throttlingErrors);
  await rerankerManager.setProvider({ useReranker: config.useReranker, offline: opts.offline });
  await initDB({ /* ... */ });

  // Only initialize file watcher for server/UI commands
  if (needsWatcher) {
    await initWatcher(!!opts.force);
  }
});
```

### Additional Fix: --force Flag Conflict

The `reset` command has a `--force` option to skip confirmation, but it conflicted with the global `--force` option used for forcing full re-indexing.

**Solution**: Check both global and local options:

```javascript
program
  .command("reset")
  .option("--force", "Skip confirmation prompt")
  .action(async (options, cmd) => {
    const globalOpts = cmd.parent.opts();
    let proceed = !!options.force || !!globalOpts.force;
    // ...
  });
```

### Test Cases

All these commands now complete instantly without triggering indexing:

```bash
# Plugin management
npm run plugin:list
npx tsx src/index.js plugin info test-plugin

# Database management
npm run reset-db
npx tsx src/index.js compact

# Configuration
npx tsx src/index.js config
```

### Performance Impact

- **Before**: `plugin list` took ~30 seconds due to indexing 33,367 files
- **After**: `plugin list` completes in <1 second

### Related Files

- `src/index.js` - Main CLI entry point with preAction hook
- `src/watcher.ts` - File watching initialization
- `src/db.js` - Database initialization

### Date Resolved
2026-01-12

---

## UI Shows Failed Indexing Status After Database Reset

### Issue
After resetting the database with `npm run reset-db` or `vibescout reset --force`, the UI continues to show the previous indexing failure status with error messages and failed file counts, even though the database is now empty.

### Root Cause
The indexing progress state is tracked in a global `indexingProgress` object in `src/core.js`. When the database is cleared via `clearDatabase()`, this global state object is NOT reset. The UI polls `/api/index/status` every 2 seconds, which returns the stale state including:
- `status: "completed_with_errors"`
- `failedFiles: <count>`
- `failedPaths: [<paths>]`
- `lastError: <error message>`

Since the state persists in memory, the UI continues to display the error banner even after a database reset.

### Solution
1. Created `resetIndexingProgress()` function in `src/core.js` to reset the global state object to initial values
2. Exported the function and added API endpoint `POST /api/index/reset` in `src/server.js`
3. Called the function in the `reset` command after clearing the database
4. Updated UI dismiss button to call the reset endpoint instead of just hiding locally

### Implementation Details

**File: src/core.js**
```javascript
export function resetIndexingProgress() {
  indexingProgress = {
    active: false,
    projectName: "",
    totalFiles: 0,
    processedFiles: 0,
    failedFiles: 0,
    failedPaths: [],
    lastError: null,
    status: "idle",
    currentFiles: [],
    completedFiles: [],
    skippedFiles: 0
  };
  logger.info("[Indexing] Progress state reset");
}
```

**File: src/server.js**
```javascript
// Import the function
import { resetIndexingProgress } from "./core.js";

// Add API endpoint
app.post('/api/index/reset', (c) => {
  resetIndexingProgress();
  return c.json({ success: true, message: "Indexing progress reset" });
});
```

**File: src/index.js**
```javascript
// Import the function
import { handleIndexFolder, stopIndexing, resetIndexingProgress } from "./core.js";

// Call it in reset command
if (proceed) {
  console.log("Clearing database...");
  await clearDatabase();
  resetIndexingProgress();  // Reset progress state
  console.log("Database cleared successfully.");
}
```

**File: ui/src/views/KBView.tsx**
```javascript
// Add handler
const handleResetProgress = async () => {
  await axios.post('/api/index/reset');
  fetchData();
};

// Update dismiss button to call reset endpoint
<button
  onClick={handleResetProgress}
  className="p-2 hover:bg-red-500/10 rounded-xl text-red-500 transition-colors"
  title="Clear Status"
>
  <X size={16} />
</button>
```

### Test Cases

1. **CLI Reset:**
   ```bash
   # Trigger indexing with some failures
   vibescout index ./test-project
   # (interrupt or let fail)

   # Reset database - should clear error status
   npm run reset-db

   # Verify: UI shows idle status instead of errors
   ```

2. **UI Dismiss:**
   - Open KB view in UI
   - Wait for indexing to complete with errors
   - Click the X button on the error banner
   - Verify: Error banner disappears and doesn't reappear on next poll

### Related Files
- `src/core.js` - Added `resetIndexingProgress()` function
- `src/server.js` - Added `/api/index/reset` endpoint
- `src/index.js` - Updated reset command
- `ui/src/views/KBView.tsx` - Updated dismiss button handler

### Date Resolved
2026-01-12

---

## Template for Future Issues

```markdown
## [Issue Title]

### Issue
[Brief description of the problem]

### Root Cause
[Technical explanation of why it occurs]

### Solution
[How it was fixed]

### Implementation Details
[Code snippets or file references]

### Test Cases
[How to verify the fix]

### Related Files
[List of affected files]

### Date Resolved
[YYYY-MM-DD]
```
