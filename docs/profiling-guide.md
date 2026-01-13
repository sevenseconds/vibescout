# Performance Profiling Guide

VibeScout includes a built-in performance profiling system that helps you analyze and optimize code indexing, search, and AI provider operations. The profiler generates Chrome DevTools-compatible flame graphs for detailed performance analysis.

## Features

- **Zero Overhead When Disabled**: Single boolean check - no performance impact when profiling is off
- **Fine-Grained Function-Level Profiling**: Track individual operations (embedding generation, database queries, MCP tools)
- **Chrome DevTools Compatible**: Generate standard trace files for visualization in `chrome://tracing`
- **Configurable Sampling**: Reduce overhead by profiling only a percentage of operations (0.0-1.0)
- **Category-Based Sampling**: Set different sampling rates for different operation types
- **Multiple Enablement Methods**: CLI flags, configuration file, Web UI, or programmatic API
- **Web UI Dashboard**: Start/stop profiling, adjust settings, and download traces from the browser

## Quick Start

### Method 1: CLI Flag (Quickest)

```bash
# Profile with 100% sampling (most detailed)
vibescout --profile index ./my-project "MyProject"

# Profile with 10% sampling (lower overhead)
vibescout --profile --profile-sampling 0.1 search "authentication flow"

# View the trace
# 1. Open chrome://tracing
# 2. Click "Load" and select the trace file from ~/.vibescout/profiles/
# 3. Zoom and pan to analyze performance
```

### Method 2: Profile Command

```bash
# Profile indexing operation
vibescout profile index --folder ./my-project --sampling 1.0

# Profile search operation
vibescout profile search --query "how does auth work?" --sampling 0.5

# Output: Trace file path and viewing instructions
```

### Method 3: Configuration File

Edit `~/.vibescout/config.json`:

```json
{
  "profiling": {
    "enabled": true,
    "samplingRate": 0.5,
    "outputDir": "~/.vibescout/profiles",
    "categorySampling": {
      "indexing": 1.0,
      "search": 0.5,
      "embedding": 0.1,
      "database": 1.0,
      "mcp": 0.3
    }
  }
}
```

Now all operations will be profiled automatically:

```bash
vibescout index ./my-project
vibescout search "authentication"
```

### Method 4: Web UI

```bash
# Start the Web UI
vibescout ui

# Navigate to http://localhost:3000/performance
```

**Web UI Features**:
- **Start/Stop Profiling**: Toggle profiling with one click
- **Sampling Rate Slider**: Adjust from 0% to 100% in real-time
- **Real-Time Status**: View buffered events, session start time
- **Recent Traces**: List of all trace files with metadata
- **Download Traces**: One-click download for offline analysis
- **Delete Traces**: Clean up old trace files

## CLI Reference

### Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--profile` | Enable performance profiling | `false` |
| `--profile-sampling <rate>` | Sampling rate (0.0-1.0) | `1.0` |
| `--profile-output <path>` | Output directory for traces | `~/.vibescout/profiles` |

### Commands

#### `vibescout profile <operation>`

Run a dedicated profiling session for a specific operation.

**Arguments**:
- `<operation>`: Operation to profile (`index` or `search`)

**Options**:
- `--folder <path>`: Folder path (for `index` operation)
- `--query <text>`: Search query (for `search` operation)
- `--sampling <rate>`: Sampling rate (0.0-1.0)

**Examples**:

```bash
# Profile indexing
vibescout profile index --folder ./my-project --sampling 1.0

# Profile search
vibescout profile search --query "API endpoints" --sampling 0.5
```

## Configuration Reference

### `profiling` Section

```json
{
  "profiling": {
    "enabled": false,
    "samplingRate": 1.0,
    "outputDir": "~/.vibescout/profiles",
    "maxBufferSize": 10000,
    "flushInterval": 5000,
    "categories": ["indexing", "search", "embedding", "database", "mcp", "git", "filesystem"],
    "categorySampling": {
      "indexing": 1.0,
      "search": 0.5,
      "embedding": 0.1,
      "database": 1.0,
      "mcp": 0.3
    }
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Master switch for profiling |
| `samplingRate` | number | `1.0` | Global sampling rate (0.0-1.0) |
| `outputDir` | string | `"~/.vibescout/profiles"` | Directory for trace files |
| `maxBufferSize` | number | `10000` | Max events before auto-flush |
| `flushInterval` | number | `5000` | Auto-flush interval in milliseconds |
| `categories` | string[] | `["indexing", "search", ...]` | Available categories |
| `categorySampling` | object | `{}` | Per-category sampling multipliers |

### Sampling Strategy

**Why Use Sampling?**

Profiling has overhead, especially for operations like:
- Embedding generation (expensive AI operations)
- Database writes (I/O intensive)
- File watching (high frequency)

Sampling reduces overhead by only profiling a percentage of operations.

**Recommended Sampling Rates**:

| Category | Rate | Overhead | Use Case |
|----------|------|----------|----------|
| `indexing` | 1.0 (100%) | Medium | Detailed indexing analysis |
| `search` | 0.5 (50%) | Low | Search performance tuning |
| `embedding` | 0.1 (10%) | Very Low | Monitor AI provider performance |
| `database` | 1.0 (100%) | Low | Database query optimization |
| `mcp` | 0.3 (30%) | Low | MCP tool performance |

**Example: Low-Overhead Production Profiling**

```json
{
  "profiling": {
    "enabled": true,
    "samplingRate": 0.1,
    "categorySampling": {
      "indexing": 0.5,
      "search": 0.2,
      "embedding": 0.05,
      "database": 0.5,
      "mcp": 0.1
    }
  }
}
```

## Instrumented Operations

The profiler automatically tracks the following operations:

### Indexing Operations (`indexing`)

- `index_folder` - Complete indexing pipeline
- `scan_files` - File system scanning
- `process_file` - Individual file processing
- `git_info_collection` - Git metadata gathering

### Search Operations (`search`)

- `search_code` - Complete search pipeline
- `query_embedding` - Query vector generation
- `db_search` - Database similarity search
- `rerank_results` - AI reranking pass

### Embedding Operations (`embedding`)

- `embedding_generate_single` - Single text embedding
- `embedding_generate_batch` - Batch embedding generation

### Database Operations (`database`)

- `db_hybrid_search` - Hybrid vector + keyword search
- `db_create_or_update_table` - Batch database writes

### MCP Tools (`mcp`)

- `mcp_tool` - All MCP tool invocations
  - `index_folder`
  - `search_code`
  - `get_file_dependencies`
  - `find_symbol_usages`
  - And more...

### Git Operations (`git`)

- Git metadata collection during indexing
- Batch git info gathering
- Churn calculation

### Filesystem Operations (`filesystem`)

- File reading
- File watching events
- Hash calculation

## Viewing Flame Graphs

### Chrome DevTools (Recommended)

1. **Download Trace**:
   - From Web UI: Click "Download" button
   - From CLI: Check `~/.vibescout/profiles/`

2. **Open Chrome Tracing**:
   ```
   chrome://tracing
   ```

3. **Load Trace**:
   - Click "Load" button
   - Select the downloaded `.json` file

4. **Navigate**:
   - **Scroll**: Pan horizontally through timeline
   - **Drag**: Zoom in on specific time ranges
   - **Hover**: View event details (name, duration, metadata)
   - **Wheel**: Zoom in/out

### Interpreting Flame Graphs

**Color Coding**:
- Events are colored by category (not duration)
- Same color = same operation type
- Different colors = different categories

**Timeline**:
- X-axis: Time (microseconds)
- Y-axis: Call stack depth
- Width: Duration of operation

**Common Patterns**:

| Pattern | Meaning | Action |
|---------|---------|--------|
| Wide blocks | Slow operations | Optimize or reduce sampling |
| Narrow towers | Fast operations | No action needed |
| Gaps | Idle time | Normal for I/O operations |
| Nested blocks | Call hierarchy | Drill down to find bottlenecks |

## API Reference

### Programmatic Profiling

```javascript
import {
  startProfiling,
  stopProfiling,
  profileAsync,
  profileStart,
  profileEnd,
  isProfilerEnabled,
  getProfilerStats
} from './profiler-api.js';

// Start profiling
startProfiling(0.5); // 50% sampling

// Check status
const enabled = isProfilerEnabled();
const stats = getProfilerStats();

// Profile async operation
const result = await profileAsync('my_operation', async () => {
  return await someExpensiveOperation();
}, { metadata: 'value' }, 'category');

// Manual start/end
profileStart('operation', { key: 'value' }, 'category');
// ... do work ...
profileEnd('operation', { result: 'value' }, 'category');

// Stop and export
const traceInfo = await stopProfiling();
console.log(`Trace saved to: ${traceInfo.filepath}`);
```

### API Endpoints

#### `POST /api/profiling/start`

Start a profiling session.

**Request**:
```json
{
  "samplingRate": 1.0,
  "categories": ["indexing", "search", "embedding"]
}
```

**Response**:
```json
{
  "success": true,
  "message": "Profiling started"
}
```

#### `POST /api/profiling/stop`

Stop profiling and get trace information.

**Response**:
```json
{
  "success": true,
  "trace": {
    "filepath": "/home/user/.vibescout/profiles/vibescout-profile-1234567890.json",
    "filename": "vibescout-profile-1234567890.json",
    "eventCount": 1523,
    "startTime": "2026-01-13T10:00:00.000Z",
    "endTime": "2026-01-13T10:05:23.456Z"
  },
  "message": "Profiling stopped"
}
```

#### `GET /api/profiling/status`

Get profiling status and statistics.

**Response**:
```json
{
  "enabled": true,
  "stats": {
    "samplingRate": 0.5,
    "bufferedEvents": 234,
    "sessionStart": "2026-01-13T10:00:00.000Z",
    "outputDir": "/home/user/.vibescout/profiles"
  }
}
```

#### `GET /api/profiling/traces`

List all available trace files.

**Response**:
```json
{
  "traces": [
    {
      "id": "vibescout-profile-1234567890",
      "filename": "vibescout-profile-1234567890.json",
      "size": 524288,
      "created": "2026-01-13T10:05:23.456Z",
      "eventCount": 1523,
      "startTime": "2026-01-13T10:00:00.000Z",
      "endTime": "2026-01-13T10:05:23.456Z"
    }
  ]
}
```

#### `GET /api/profiling/download?id=<id>`

Download a trace file.

**Response**: Raw JSON trace file (Chrome DevTools format)

## Performance Optimization

### Common Bottlenecks

1. **Embedding Generation**
   - **Symptom**: Wide `embedding_generate_single` blocks
   - **Solution**: Use batch embeddings, switch to faster provider

2. **Database Queries**
   - **Symptom**: Wide `db_search` blocks
   - **Solution**: Reduce `limit` parameter, add category pre-filtering

3. **File I/O**
   - **Symptom**: Wide `process_file` blocks
   - **Solution**: Exclude large files, use `.vibeignore`

4. **Git Operations**
   - **Symptom**: Wide `git_info_collection` blocks
   - **Solution**: Disable git integration for large repos

### Optimization Workflow

1. **Profile**: Run with 100% sampling to capture all operations
2. **Analyze**: Open trace in Chrome DevTools
3. **Identify**: Find widest blocks (slowest operations)
4. **Optimize**: Apply targeted optimizations
5. **Verify**: Profile again to measure improvement

### Example: Optimizing Search

**Before**:
```json
{
  "search": {
    "minScore": 0.2
  }
}
```
**Trace Shows**: Wide `rerank_results` block (100ms+)

**After**:
```json
{
  "search": {
    "minScore": 0.4  // Higher threshold = fewer results to rerank
  }
}
```
**Result**: Reranking reduced to 20ms

## Troubleshooting

### No Trace File Generated

**Problem**: Profiling completed but no trace file exists.

**Solutions**:
1. Check sampling rate: If too low (e.g., 0.01), may not capture any events
2. Check output directory: Ensure `~/.vibescout/profiles/` is writable
3. Verify operations ran: Ensure the profiled operation actually executed

### Empty Trace File

**Problem**: Trace file exists but contains no events.

**Solutions**:
1. Increase sampling rate to 1.0
2. Check category sampling: Ensure category multiplier > 0
3. Verify instrumentation: Operation may not be instrumented yet

### High Overhead

**Problem**: Profiling slows down operations significantly.

**Solutions**:
1. Reduce sampling rate: Try 0.1 or 0.05
2. Adjust category sampling: Lower `embedding` and `mcp` rates
3. Profile shorter operations: Use `vibescout profile` instead of `--profile`

### Trace File Too Large

**Problem**: Trace file is hundreds of MB.

**Solutions**:
1. Reduce sampling rate
2. Profile shorter operations
3. Lower `maxBufferSize` in config
4. Delete old traces: Check Web UI → Performance

## Best Practices

### Development

```bash
# Full profiling for debugging
vibescout --profile --profile-sampling 1.0 index ./my-project
```

### Production

```json
{
  "profiling": {
    "enabled": true,
    "samplingRate": 0.05,
    "categorySampling": {
      "embedding": 0.01,
      "database": 0.1,
      "mcp": 0.05
    }
  }
}
```

### Performance Testing

```bash
# Compare with/without profiling
time vibescout index ./my-project
time vibescout --profile --profile-sampling 0.1 index ./my-project
```

### Continuous Monitoring

```bash
# Start Web UI with profiling
vibescout ui
# Navigate to http://localhost:3000/performance
# Click "Start Profiling" and let it run in the background
```

## Additional Resources

- **Chrome DevTools**: [chrome://tracing](chrome://tracing)
- **Trace Format**: [Chrome Trace Event Format](https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchPAyXs/preview)
- **Performance Optimization**: See main README for tuning tips
- **Configuration**: See `src/config.js` DEFAULT_CONFIG for all options
