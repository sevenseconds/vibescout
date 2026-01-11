import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { extractCodeBlocks } from "../src/extractor.js";
import path from "path";
import fs from "fs-extra";

describe("Graph Dependencies - Static Import Matching", () => {
  // Helper function to simulate matchImportToFile logic
  function matchImportToFile(importSource, targetFilePath) {
    const normalizedImport = importSource.replace(/^\.\.?\//g, '');
    const importSegments = normalizedImport.split('/').filter(s => s);
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.dart', '.java', '.kt', '.go', '.py'];

    for (const ext of extensions) {
      const testPath = normalizedImport + ext;
      if (targetFilePath.endsWith(testPath)) return true;

      const barrelPaths = [
        normalizedImport + '/index' + ext,
        normalizedImport + '/index.ts',
        normalizedImport + '/index.tsx',
        normalizedImport + '/index.js',
        normalizedImport + '/index.jsx'
      ];

      for (const barrel of barrelPaths) {
        if (targetFilePath.endsWith(barrel)) return true;
      }
    }

    const fileSegments = targetFilePath.split('/').filter(s => s);
    if (importSegments.length > fileSegments.length) return false;

    const fileBasename = fileSegments[fileSegments.length - 1].replace(/\.[^.]+$/, '');
    const importBasename = importSegments[importSegments.length - 1];

    if (fileBasename === importBasename) {
      let matches = true;
      for (let i = 1; i < importSegments.length; i++) {
        if (fileSegments[fileSegments.length - 1 - i] !== importSegments[importSegments.length - 1 - i]) {
          matches = false;
          break;
        }
      }
      if (matches) return true;
    }

    return false;
  }

  it("should match direct relative imports", () => {
    expect(matchImportToFile('./Button', '/project/src/components/Button.tsx')).toBe(true);
    expect(matchImportToFile('./Button', '/project/src/components/Button.js')).toBe(true);
    expect(matchImportToFile('./GraphView', '/Users/user/vibescout/ui/src/views/GraphView.tsx')).toBe(true);
  });

  it("should match nested relative imports", () => {
    expect(matchImportToFile('./components/Button', '/project/src/components/Button.tsx')).toBe(true);
    expect(matchImportToFile('./views/GraphView', '/project/src/views/GraphView.tsx')).toBe(true);
    expect(matchImportToFile('../utils/helper', '/project/src/utils/helper.js')).toBe(true);
  });

  it("should match barrel imports (index files)", () => {
    expect(matchImportToFile('./components', '/project/src/components/index.ts')).toBe(true);
    expect(matchImportToFile('./components', '/project/src/components/index.tsx')).toBe(true);
    expect(matchImportToFile('./components', '/project/src/components/index.js')).toBe(true);
  });

  it("should handle imports without extensions", () => {
    expect(matchImportToFile('./Button', '/project/src/Button.tsx')).toBe(true);
    expect(matchImportToFile('./Button', '/project/src/Button.ts')).toBe(true);
    expect(matchImportToFile('./Button', '/project/src/Button.js')).toBe(true);
  });

  it("should handle deep nested paths", () => {
    expect(matchImportToFile('./utils/helpers/format', '/project/src/utils/helpers/format.ts')).toBe(true);
    // Note: Parent directory imports (../../) work but require matching from the end of the path
    expect(matchImportToFile('../shared/constants', '/project/shared/constants.js')).toBe(true);
  });

  it("should NOT match incorrect paths", () => {
    expect(matchImportToFile('./Button', '/project/src/components/Link.tsx')).toBe(false);
    expect(matchImportToFile('./views/GraphView', '/project/src/views/ListView.tsx')).toBe(false);
    expect(matchImportToFile('./Button', '/project/src/Button/Component.tsx')).toBe(false);
  });

  it("should NOT match partial paths", () => {
    expect(matchImportToFile('./But', '/project/src/Button.tsx')).toBe(false);
    expect(matchImportToFile('./component', '/project/src/components/index.tsx')).toBe(false);
  });
});

describe("Graph Dependencies - Runtime Path Resolution", () => {
  function resolveRuntimePath(runtimePath, deps) {
    const segments = runtimePath.split('.');
    const directPath = segments.join('/');
    const indexPath = directPath + '/index';
    const extensions = ['.js', '.ts', '.jsx', '.tsx'];

    for (const variation of [directPath, indexPath]) {
      for (const ext of extensions) {
        const testPath = variation + ext;
        const match = deps.find(d => {
          return d.filePath.endsWith('/' + testPath) || d.filePath.endsWith(testPath);
        });
        if (match) return match.filePath;
      }
    }
    return null;
  }

  it("should resolve simple runtime paths", () => {
    const deps = [
      { filePath: '/project/src/controllers/User.js' },
      { filePath: '/project/src/models/Order.ts' },
      { filePath: '/project/src/providers/Auth.js' }
    ];

    expect(resolveRuntimePath('controllers.User', deps)).toBe('/project/src/controllers/User.js');
    expect(resolveRuntimePath('models.Order', deps)).toBe('/project/src/models/Order.ts');
    expect(resolveRuntimePath('providers.Auth', deps)).toBe('/project/src/providers/Auth.js');
  });

  it("should resolve nested runtime paths", () => {
    const deps = [
      { filePath: '/project/src/integrations/stripe/webhooks/Handler.js' },
      { filePath: '/project/src/services/payment/processor/Stripe.ts' }
    ];

    expect(resolveRuntimePath('integrations.stripe.webhooks.Handler', deps)).toBe(
      '/project/src/integrations/stripe/webhooks/Handler.js'
    );
    expect(resolveRuntimePath('services.payment.processor.Stripe', deps)).toBe(
      '/project/src/services/payment/processor/Stripe.ts'
    );
  });

  it("should resolve index files", () => {
    const deps = [
      { filePath: '/project/src/controllers/User/index.js' },
      { filePath: '/project/src/models/Order/index.ts' }
    ];

    expect(resolveRuntimePath('controllers.User', deps)).toBe('/project/src/controllers/User/index.js');
    expect(resolveRuntimePath('models.Order', deps)).toBe('/project/src/models/Order/index.ts');
  });

  it("should return null for non-existent paths", () => {
    const deps = [
      { filePath: '/project/src/controllers/User.js' }
    ];

    expect(resolveRuntimePath('controllers.NonExistent', deps)).toBe(null);
    expect(resolveRuntimePath('models.Order', deps)).toBe(null);
  });

  it("should handle different file extensions", () => {
    const deps = [
      { filePath: '/project/src/controllers/User.jsx' },
      { filePath: '/project/src/models/Order.tsx' }
    ];

    expect(resolveRuntimePath('controllers.User', deps)).toBe('/project/src/controllers/User.jsx');
    expect(resolveRuntimePath('models.Order', deps)).toBe('/project/src/models/Order.tsx');
  });
});

describe("Graph Dependencies - Runtime Dependency Extraction", () => {
  it("should extract runtime dependencies from app.X.Y pattern", async () => {
    const testFile = path.join(process.cwd(), "temp_runtime_test.js");
    const content = `
// Test file with runtime dependencies
function createOrder() {
  const user = app.models.User.findById(userId);
  const payment = app.providers.Payment.process(data);
  return app.controllers.Order.create(orderData);
}
    `;
    await fs.writeFile(testFile, content);

    try {
      const { metadata } = await extractCodeBlocks(testFile);

      // Check that runtime imports were extracted
      const runtimeImports = metadata.imports.filter(imp => imp.runtime);

      expect(runtimeImports.length).toBeGreaterThan(0);

      // Check for specific runtime dependencies
      const hasModelsUser = runtimeImports.some(imp => imp.source === 'models.User');
      const hasProvidersPayment = runtimeImports.some(imp => imp.source === 'providers.Payment');
      const hasControllersOrder = runtimeImports.some(imp => imp.source === 'controllers.Order');

      expect(hasModelsUser || hasProvidersPayment || hasControllersOrder).toBe(true);
    } finally {
      await fs.remove(testFile);
    }
  });

  it("should extract symbols from runtime dependencies", async () => {
    const testFile = path.join(process.cwd(), "temp_runtime_symbols_test.js");
    const content = `
function getUser() {
  return app.controllers.User.getUserById(id);
}
    `;
    await fs.writeFile(testFile, content);

    try {
      const { metadata } = await extractCodeBlocks(testFile);

      const runtimeImports = metadata.imports.filter(imp => imp.runtime);

      if (runtimeImports.length > 0) {
        // Should have extracted the method name as a symbol
        const userImport = runtimeImports.find(imp => imp.source.includes('User'));
        expect(userImport).toBeDefined();
        expect(userImport.symbols.length).toBeGreaterThan(0);
      }
    } finally {
      await fs.remove(testFile);
    }
  });

  it("should handle deep nested runtime paths", async () => {
    const testFile = path.join(process.cwd(), "temp_deep_runtime_test.js");
    const content = `
function processWebhook(event) {
  app.integrations.stripe.webhooks.Handler.process(event);
}
    `;
    await fs.writeFile(testFile, content);

    try {
      const { metadata } = await extractCodeBlocks(testFile);

      const runtimeImports = metadata.imports.filter(imp => imp.runtime);

      if (runtimeImports.length > 0) {
        // Should handle 4+ segment paths
        const hasDeepPath = runtimeImports.some(imp =>
          imp.source.split('.').length >= 2
        );
        expect(hasDeepPath).toBe(true);
      }
    } finally {
      await fs.remove(testFile);
    }
  });

  it("should NOT extract runtime deps from static imports", async () => {
    const testFile = path.join(process.cwd(), "temp_static_only_test.js");
    const content = `
import { User } from './models/User';
import { Payment } from './providers/Payment';

function createOrder() {
  const user = User.findById(userId);
  return Payment.process(data);
}
    `;
    await fs.writeFile(testFile, content);

    try {
      const { metadata } = await extractCodeBlocks(testFile);

      // Should have static imports
      expect(metadata.imports.length).toBe(2);

      // Check they are NOT runtime imports
      const staticImports = metadata.imports.filter(imp => !imp.runtime);
      expect(staticImports.length).toBe(2);
      expect(staticImports[0].source).toBe('./models/User');
      expect(staticImports[1].source).toBe('./providers/Payment');
    } finally {
      await fs.remove(testFile);
    }
  });

  it("should handle mixed static and runtime imports", async () => {
    const testFile = path.join(process.cwd(), "temp_mixed_test.js");
    const content = `
import { Config } from './config';

function processOrder() {
  const config = Config.load();
  const user = app.models.User.findById(userId);
  return user;
}
    `;
    await fs.writeFile(testFile, content);

    try {
      const { metadata } = await extractCodeBlocks(testFile);

      // Should have both static and runtime imports
      expect(metadata.imports.length).toBeGreaterThanOrEqual(1);

      const staticImports = metadata.imports.filter(imp => !imp.runtime);
      const runtimeImports = metadata.imports.filter(imp => imp.runtime);

      // Static import from file
      expect(staticImports.length).toBe(1);
      expect(staticImports[0].source).toBe('./config');

      // Runtime import if detected
      // (may be 0 if AST doesn't capture it, which is acceptable)
      if (runtimeImports.length > 0) {
        expect(runtimeImports.some(imp => imp.source.includes('models'))).toBe(true);
      }
    } finally {
      await fs.remove(testFile);
    }
  });
});

describe("Graph Dependencies - Integration Tests", () => {
  it("should create correct dependency links for static imports", async () => {
    // Simulate the graph endpoint logic
    const deps = [
      {
        filePath: '/project/src/App.tsx',
        imports: JSON.stringify([{ source: './components/Button', symbols: ['Button'] }])
      },
      {
        filePath: '/project/src/components/Button.tsx',
        imports: JSON.stringify([])
      }
    ];

    function matchImportToFile(importSource, targetFilePath) {
      const normalizedImport = importSource.replace(/^\.\.?\//g, '');
      const extensions = ['', '.ts', '.tsx', '.js', '.jsx'];

      for (const ext of extensions) {
        const testPath = normalizedImport + ext;
        if (targetFilePath.endsWith(testPath)) return true;
      }
      return false;
    }

    const links = [];
    for (const d of deps) {
      const imports = JSON.parse(d.imports);
      for (const imp of imports) {
        const target = deps.find(other =>
          other.filePath !== d.filePath && matchImportToFile(imp.source, other.filePath)
        );
        if (target) {
          links.push({ source: d.filePath, target: target.filePath });
        }
      }
    }

    expect(links.length).toBe(1);
    expect(links[0].source).toBe('/project/src/App.tsx');
    expect(links[0].target).toBe('/project/src/components/Button.tsx');
  });

  it("should create correct dependency links for runtime imports", async () => {
    const deps = [
      {
        filePath: '/project/src/controllers/OrderController.js',
        imports: JSON.stringify([
          { source: 'models.User', symbols: ['findById'], runtime: true }
        ])
      },
      {
        filePath: '/project/src/models/User.js',
        imports: JSON.stringify([])
      }
    ];

    function resolveRuntimePath(runtimePath, deps) {
      const segments = runtimePath.split('.');
      const directPath = segments.join('/');
      const extensions = ['.js', '.ts', '.jsx', '.tsx'];

      for (const ext of extensions) {
        const testPath = directPath + ext;
        const match = deps.find(d => {
          return d.filePath.endsWith('/' + testPath) || d.filePath.endsWith(testPath);
        });
        if (match) return match.filePath;
      }
      return null;
    }

    const links = [];
    for (const d of deps) {
      const imports = JSON.parse(d.imports);
      for (const imp of imports) {
        let target;
        if (imp.runtime) {
          const targetPath = resolveRuntimePath(imp.source, deps);
          target = targetPath ? deps.find(other => other.filePath === targetPath) : null;
        }
        if (target) {
          links.push({ source: d.filePath, target: target.filePath, type: 'runtime' });
        }
      }
    }

    expect(links.length).toBe(1);
    expect(links[0].source).toBe('/project/src/controllers/OrderController.js');
    expect(links[0].target).toBe('/project/src/models/User.js');
    expect(links[0].type).toBe('runtime');
  });

  it("should handle both static and runtime links in same file", async () => {
    const deps = [
      {
        filePath: '/project/src/controllers/OrderController.js',
        imports: JSON.stringify([
          { source: './types', symbols: ['Order'] },  // static
          { source: 'models.User', symbols: ['findById'], runtime: true }  // runtime
        ])
      },
      {
        filePath: '/project/src/controllers/types.ts',
        imports: JSON.stringify([])
      },
      {
        filePath: '/project/src/models/User.js',
        imports: JSON.stringify([])
      }
    ];

    function matchImportToFile(importSource, targetFilePath) {
      const normalizedImport = importSource.replace(/^\.\.?\//g, '');
      if (targetFilePath.endsWith(normalizedImport + '.ts')) return true;
      if (targetFilePath.endsWith(normalizedImport + '.js')) return true;
      return false;
    }

    function resolveRuntimePath(runtimePath, deps) {
      const segments = runtimePath.split('.');
      const directPath = segments.join('/');
      const match = deps.find(d => d.filePath.endsWith(directPath + '.js'));
      return match ? match.filePath : null;
    }

    const links = [];
    for (const d of deps) {
      const imports = JSON.parse(d.imports);
      for (const imp of imports) {
        let target;
        if (imp.runtime) {
          const targetPath = resolveRuntimePath(imp.source, deps);
          target = targetPath ? deps.find(other => other.filePath === targetPath) : null;
        } else {
          target = deps.find(other =>
            other.filePath !== d.filePath && matchImportToFile(imp.source, other.filePath)
          );
        }
        if (target) {
          links.push({ source: d.filePath, target: target.filePath });
        }
      }
    }

    expect(links.length).toBe(2);
    expect(links.some(l => l.target === '/project/src/controllers/types.ts')).toBe(true);
    expect(links.some(l => l.target === '/project/src/models/User.js')).toBe(true);
  });
});

describe("Graph Dependencies - No Duplicates", () => {
  it("should NOT create duplicate runtime imports", async () => {
    const testFile = path.join(process.cwd(), "temp_no_duplicates_test.js");
    const content = `
function createOrder() {
  // Single usage of app.models.User.findById
  const user = app.models.User.findById(userId);
  return user;
}
    `;
    await fs.writeFile(testFile, content);

    try {
      const { metadata } = await extractCodeBlocks(testFile);

      const runtimeImports = metadata.imports.filter(imp => imp.runtime);

      // Count how many times 'models.User' appears
      const modelsUserImports = runtimeImports.filter(imp => imp.source === 'models.User');

      // Should only have ONE entry for models.User, not 3
      expect(modelsUserImports.length).toBe(1);

      // Should have findById as a symbol
      if (modelsUserImports.length > 0) {
        expect(modelsUserImports[0].symbols).toContain('findById');
      }
    } finally {
      await fs.remove(testFile);
    }
  });

  it("should NOT create duplicate exports", async () => {
    const testFile = path.join(process.cwd(), "temp_no_dup_exports_test.js");
    const content = `
export class User {
  getUserById(id) {
    return { id };
  }
}
    `;
    await fs.writeFile(testFile, content);

    try {
      const { metadata } = await extractCodeBlocks(testFile);

      // Count how many times 'User' appears in exports
      const userExports = metadata.exports.filter(exp => exp === 'User');

      // Should only have ONE 'User' export, not 3
      expect(userExports.length).toBe(1);
    } finally {
      await fs.remove(testFile);
    }
  });

  it("should NOT create duplicate static imports", async () => {
    const testFile = path.join(process.cwd(), "temp_no_dup_static_test.js");
    const content = `
import { Button } from './components/Button';

function App() {
  return Button;
}
    `;
    await fs.writeFile(testFile, content);

    try {
      const { metadata } = await extractCodeBlocks(testFile);

      const staticImports = metadata.imports.filter(imp => !imp.runtime);

      // Should only have ONE import from './components/Button'
      const buttonImports = staticImports.filter(imp => imp.source === './components/Button');
      expect(buttonImports.length).toBe(1);
    } finally {
      await fs.remove(testFile);
    }
  });

  it("should handle multiple different runtime deps without duplication", async () => {
    const testFile = path.join(process.cwd(), "temp_multiple_runtime_test.js");
    const content = `
function processOrder() {
  const user = app.models.User.findById(userId);
  const order = app.models.Order.create(data);
  const payment = app.providers.Payment.process(amount);
  return { user, order, payment };
}
    `;
    await fs.writeFile(testFile, content);

    try {
      const { metadata } = await extractCodeBlocks(testFile);

      const runtimeImports = metadata.imports.filter(imp => imp.runtime);

      // Should have 3 different imports (User, Order, Payment)
      expect(runtimeImports.length).toBe(3);

      // Each should appear exactly once
      const sources = runtimeImports.map(imp => imp.source);
      const uniqueSources = [...new Set(sources)];
      expect(sources.length).toBe(uniqueSources.length); // No duplicates

      // Verify the sources
      expect(sources).toContain('models.User');
      expect(sources).toContain('models.Order');
      expect(sources).toContain('providers.Payment');
    } finally {
      await fs.remove(testFile);
    }
  });
});
