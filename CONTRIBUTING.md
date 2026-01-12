# Contributing to VibeScout

Thank you for your interest in contributing to VibeScout!

## Development

- **Architecture**: Uses the **Strategy Pattern** for extractors located in `src/extractors/`.
- **Testing**: `npm test` (Runs Vitest sequentially to prevent DB race conditions).
- **Linting**: `npm run lint` (ESLint with 2-space indentation).

## Common Tasks

### Building the UI
To build the Web UI for production and synchronize it with the backend:
```bash
npm run build:ui
```
This command builds the React application and copies the assets to `src/ui-dist/` so they can be served by the backend.

### Resetting the Database
If you encounter schema issues or want to clear all indexed data:
```bash
npm run reset-db
```

### Adding New Language Support
1. Create a new strategy in `src/extractors/` (e.g., `RustStrategy.js`).
2. Implement the `extract` method using `tree-sitter`.
3. Register the extension in `src/extractor.js`.
4. Ensure code blocks are assigned the `category: "code"` property.
5. Add a test case in `tests/`.
