# Two-Phase Search with Token Count Preview

VibeScout supports a two-phase search workflow for MCP clients (Claude Desktop, Cursor, etc.) that allows you to preview search result metadata before consuming tokens with full code content.

## Overview

When searching large codebases, you may encounter:
- Unexpectedly high token consumption
- No visibility into result size before fetching
- Wasted context window on irrelevant results

Two-phase search solves this by:
1. **Preview Phase**: Returns metadata (result count, token count, relevance) without code
2. **Fetch Phase**: Returns full results only if you approve the token cost

## How It Works

### Phase 1: Preview Metadata

```json
{
  "name": "search_code",
  "arguments": {
    "query": "database connection",
    "limit": 20,
    "previewOnly": true
  }
}
```

**Response:**
```
# Search Preview for: "database connection"

📊 **Metadata**
- Results found: 20
- Total tokens: 12,500 (from stored counts)
- Requested limit: 20
- Average score: 0.7245

💡 **Recommendation**
High token count (12,500 tokens). Consider reducing limit to 10 or using more specific filters.

🔄 **Next Steps**
To get actual results, call `search_code` again with:
- Same query: "database connection"
- Same filters (collection, projectName, etc.)
- `previewOnly: false` (or omit)
- Optional: Adjust `limit` to 10 if token count is high

---
*This preview consumed ~1250 tokens. Full results would consume ~12,500 tokens.*
```

### Phase 2: Fetch Results

After reviewing the metadata, you can:

**Option A: Proceed with suggested limit**
```json
{
  "name": "search_code",
  "arguments": {
    "query": "database connection",
    "limit": 10,
    "minScore": 0.7,
    "previewOnly": false
  }
}
```

**Option B: Add more specific filters**
```json
{
  "name": "search_code",
  "arguments": {
    "query": "database connection",
    "limit": 15,
    "categories": ["code"],
    "authors": ["Alice"],
    "previewOnly": false
  }
}
```

**Option C: Skip if tokens are too high**
Don't call `search_code` again - try a different query or use more specific terms.

## API Reference

### `search_code` Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | **required** | The search query |
| `limit` | number | 10 | Maximum number of results (1-50) |
| `previewOnly` | boolean | false | If true, returns metadata only (no code content) |
| `collection` | string | undefined | Filter by collection name |
| `projectName` | string | undefined | Filter by project name |
| `categories` | array | undefined | Filter by categories: `["code"]`, `["documentation"]`, or both |
| `authors` | array | undefined | Filter by commit authors: `["Alice", "Bob"]` |
| `dateFrom` | string | undefined | Filter by minimum commit date (ISO format) |
| `dateTo` | string | undefined | Filter by maximum commit date (ISO format) |
| `churnLevels` | array | undefined | Filter by code stability: `["low", "medium", "high"]` |
| `minScore` | number | 0.4 | Minimum confidence score (0-1) |

### Metadata Response Format

When `previewOnly: true`, the response includes:

- **Results found**: Number of matching code blocks
- **Total tokens**: Sum of all token counts (stored during indexing)
- **Requested limit**: The `limit` parameter you provided
- **Average score**: Mean relevance score across all results
- **Recommendation**:
  - If tokens > 5000: Suggests reducing limit
  - If tokens ≤ 5000: Proceed with full results
- **Next Steps**: Instructions for fetching actual results
- **Preview tokens**: Approximate tokens consumed by this preview

## Use Cases

### 1. Exploratory Searching

When you're unsure what you're looking for:

```json
// Broad search with preview
{
  "query": "database",
  "limit": 30,
  "previewOnly": true
}
```

If the preview shows 25,000 tokens across 30 results:
```json
// Narrow down with specific terms
{
  "query": "database connection pool",
  "limit": 10,
  "previewOnly": true
}
```

### 2. Context Window Management

When you have limited context available:

```json
// Preview first
{
  "query": "authentication middleware",
  "limit": 20,
  "previewOnly": true
}
```

Response shows 8,000 tokens. Adjust based on available context:
```json
// Smaller limit to fit in context window
{
  "query": "authentication middleware",
  "limit": 5,
  "previewOnly": false
}
```

### 3. Quality Filtering

When you want only the most relevant results:

```json
// Preview with high minimum score
{
  "query": "user authentication",
  "limit": 20,
  "minScore": 0.7,
  "previewOnly": true
}
```

This returns fewer, higher-quality results with lower token cost.

### 4. Author-Specific Search

When you want code from specific team members:

```json
// Preview results by author
{
  "query": "API endpoint",
  "authors": ["Alice", "Bob"],
  "limit": 15,
  "previewOnly": true
}
```

## Implementation Details

### Token Counting

Token counts are calculated during indexing using a simple approximation:

```javascript
function countTokens(text) {
  if (!text) return 0;
  // Approximate tokens: ~4 characters per token (works for code)
  return Math.ceil(text.length / 4);
}
```

**Why this approximation?**
- Fast and simple (no external dependencies)
- Sufficient for preview metadata
- Consistent across all searches
- Stored in database for instant retrieval

### Database Storage

Token counts are stored in LanceDB as part of each code block record:

```typescript
interface VectorResult {
  // ... other fields
  token_count?: number;  // Stored during indexing
}
```

This means:
- ✅ **Instant retrieval**: No recalculation needed
- ✅ **Accurate**: Based on actual indexed content
- ✅ **Consistent**: Same count every time
- ❌ **Not exact**: Approximation (sufficient for preview use)

### Backward Compatibility

The feature is fully backward compatible:

- **Existing behavior**: Omit `previewOnly` or set to `false` for full results
- **New behavior**: Set `previewOnly: true` for metadata-only response
- **No breaking changes**: All existing MCP clients work unchanged

### Migration

Existing databases automatically migrate to include `token_count`:

1. On first search, VibeScout detects missing `token_count` field
2. Fetches all existing records
3. Calculates token counts: `Math.ceil(content.length / 4)`
4. Recreates table with new schema
5. Future indexings store counts automatically

## Best Practices

### 1. Always Preview Broad Searches

```json
// ✅ Good: Preview first
{
  "query": "database",
  "limit": 30,
  "previewOnly": true
}

// ❌ Bad: Direct fetch (might consume 20k+ tokens)
{
  "query": "database",
  "limit": 30
}
```

### 2. Use Preview to Tune Parameters

```json
// Step 1: Preview with initial parameters
{
  "query": "auth",
  "limit": 20,
  "previewOnly": true
}

// Step 2: Adjust based on metadata
{
  "query": "auth",
  "limit": 8,           // Reduced from 20
  "minScore": 0.6,      // Added quality filter
  "categories": ["code"], // Filter out docs
  "previewOnly": false
}
```

### 3. Combine Filters for Precision

```json
// Preview with multiple filters
{
  "query": "API",
  "projectName": "backend-service",
  "categories": ["code"],
  "authors": ["Alice"],
  "dateFrom": "2024-01-01",
  "limit": 15,
  "previewOnly": true
}
```

### 4. Check Average Score

If preview shows low average score (< 0.5), consider:
- Using more specific query terms
- Adding `minScore` filter
- Reducing `limit` parameter

## Examples

### Example 1: High Token Count (Adjust)

**Preview:**
```json
{
  "query": "react component",
  "limit": 25,
  "previewOnly": true
}
```

**Response:**
```
Results found: 25
Total tokens: 18,500 (from stored counts)
Average score: 0.6123
Recommendation: High token count. Consider reducing limit to 12.
```

**Action:** Reduce limit and add score filter
```json
{
  "query": "react component",
  "limit": 12,
  "minScore": 0.65,
  "previewOnly": false
}
```

### Example 2: Reasonable Token Count (Proceed)

**Preview:**
```json
{
  "query": "getUserById",
  "limit": 10,
  "previewOnly": true
}
```

**Response:**
```
Results found: 3
Total tokens: 850 (from stored counts)
Average score: 0.8912
Recommendation: Token count is reasonable. Proceed with full results.
```

**Action:** Fetch full results
```json
{
  "query": "getUserById",
  "limit": 10,
  "previewOnly": false
}
```

### Example 3: No Results (Refine Query)

**Preview:**
```json
{
  "query": "quantum computing algorithm",
  "limit": 10,
  "previewOnly": true
}
```

**Response:**
```
Results found: 0
Recommendation: No matches found. Try different query terms.
```

**Action:** Try different query or check if project is indexed

## Performance Considerations

### Preview Mode

- **Overhead**: ~1-5ms (just sums stored integers)
- **Network**: Same as regular search (database query)
- **Tokens**: ~50-200 tokens for metadata response

### Full Results Mode

- **Overhead**: Same as before (no performance impact)
- **Tokens**: Variable (depends on result count and code length)

### Storage

- **Database**: +8 bytes per record (integer field)
- **Migration**: Automatic (one-time cost on first use)

## Troubleshooting

### "No results found" in preview

**Cause:** Query doesn't match any indexed code

**Solutions:**
- Check project is indexed: Use `get_indexing_status` tool
- Try broader query terms
- Remove filters (`authors`, `categories`, etc.)
- Verify `projectName` and `collection` are correct

### Token count seems incorrect

**Cause:** Approximation based on character count

**Note:** Token counts are approximate (~4 chars per token), not exact. This is sufficient for preview decisions but may vary from actual tokenizer results.

**For reference:**
- Short code block (50 chars): ~13 tokens
- Medium function (200 chars): ~50 tokens
- Large class (1000 chars): ~250 tokens

### Preview shows high tokens, but I need all results

**Options:**
1. **Increase context window**: Use Claude 200k or similar
2. **Batch processing**: Search multiple times with different filters
3. **Export results**: Use Web UI to export and analyze separately
4. **Narrow query**: Use more specific terms to reduce results

## Future Enhancements

Potential improvements being considered:

- [ ] Configurable token threshold (default: 5000)
- [ ] Preview top N results with code snippets
- [ ] Export preview metadata to file
- [ ] Historical preview statistics
- [ ] Automatic query refinement suggestions
