/**
 * React Router v7 / Remix Plugin for VibeScout
 *
 * This plugin extends VibeScout to extract React Router/Remix-specific metadata:
 * - Route exports (loader, action, headers, meta, links)
 * - Navigation dependencies (Link, NavLink, useNavigate)
 * - Route parameters
 * - Form actions
 */

import path from "path";
import { TypeScriptStrategy } from "../../../extractors/TypeScriptStrategy.js";

/**
 * Check if file is a Remix/React Router route file.
 */
function isRouteFile(filePath) {
  const segments = filePath.split(path.sep);
  const routesIndex = segments.findIndex(s => s === "routes");

  if (routesIndex === -1) {
    return false;
  }

  // File is in routes directory
  return true;
}

/**
 * Extract route name from file path.
 */
function extractRouteName(filePath) {
  const segments = filePath.split(path.sep);
  const routesIndex = segments.findIndex(s => s === "routes");

  if (routesIndex === -1) {
    return null;
  }

  // Get route path after routes/ directory
  const routePath = segments.slice(routesIndex + 1).join("/");

  // Remove file extension
  return routePath.replace(/\.(tsx?|jsx?)$/, "");
}

/**
 * Extract Remix/React Router exports from code.
 */
function extractRouteExports(code) {
  const exports = {
    hasLoader: false,
    hasAction: false,
    hasHeaders: false,
    hasMeta: false,
    hasLinks: false,
    hasErrorBoundary: false,
    hasDefaultExport: false,
  };

  // Check for loader export
  exports.hasLoader = /export\s+(const|function|async\s+function)\s+loader/.test(code) ||
                       /export\s*{\s*loader\s*}/.test(code);

  // Check for action export
  exports.hasAction = /export\s+(const|function|async\s+function)\s+action/.test(code) ||
                      /export\s*{\s*action\s*}/.test(code);

  // Check for headers export
  exports.hasHeaders = /export\s+(const|function)\s+headers/.test(code) ||
                       /export\s*{\s*headers\s*}/.test(code);

  // Check for meta export
  exports.hasMeta = /export\s+(const|function)\s+meta/.test(code) ||
                    /export\s*{\s*meta\s*}/.test(code);

  // Check for links export
  exports.hasLinks = /export\s+(const|function)\s+links/.test(code) ||
                     /export\s*{\s*links\s*}/.test(code);

  // Check for ErrorBoundary export
  exports.hasErrorBoundary = /export\s+(const|function)\s+ErrorBoundary/.test(code) ||
                             /export\s*{\s*ErrorBoundary\s*}/.test(code);

  // Check for default export
  exports.hasDefaultExport = /export\s+default/.test(code);

  return exports;
}

/**
 * Extract React Router navigation dependencies.
 */
function extractNavigationDependencies(code) {
  const dependencies = [];

  // Find <Link to="..."> patterns
  const linkRegex = /<Link\s+(?:[^>]*?\s+)?to\s*=\s*["']([^"']+)["']/g;
  let match;
  while ((match = linkRegex.exec(code)) !== null) {
    dependencies.push({
      type: "link",
      target: match[1],
      component: "Link"
    });
  }

  // Find <NavLink to="..."> patterns
  const navLinkRegex = /<NavLink\s+(?:[^>]*?\s+)?to\s*=\s*["']([^"']+)["']/g;
  while ((match = navLinkRegex.exec(code)) !== null) {
    dependencies.push({
      type: "link",
      target: match[1],
      component: "NavLink"
    });
  }

  // Find navigate("/path") patterns
  const navigateRegex = /navigate\(["']([^"']+)["'](?:,\s*({[^}]*}))?\)/g;
  while ((match = navigateRegex.exec(code)) !== null) {
    const options = match[2] ? JSON.parse(match[2]) : {};
    dependencies.push({
      type: "navigation",
      target: match[1],
      method: "navigate",
      options
    });
  }

  // Find <Form action="..."> patterns
  const formRegex = /<Form\s+(?:[^>]*?\s+)?action\s*=\s*["']([^"']+)["']/g;
  while ((match = formRegex.exec(code)) !== null) {
    dependencies.push({
      type: "form",
      target: match[1],
      component: "Form"
    });
  }

  return dependencies;
}

/**
 * Extract route parameters from code.
 */
function extractRouteParams(code) {
  const params = [];

  // Find useParams() hook usage
  const useParamsRegex = /useParams\(\)/g;
  const hasUseParams = useParamsRegex.test(code);

  if (hasUseParams) {
    // Try to extract param names from destructuring
    const destructuringRegex = /const\s*{\s*([^}]+)\s*}\s*=\s*useParams\(\)/;
    const match = destructuringRegex.exec(code);
    if (match) {
      const paramNames = match[1].split(",").map(p => p.trim().split(":")[0]);
      params.push(...paramNames);
    }
  }

  // Find params in loader/action function signatures
  const loaderParamsRegex = /(?:loader|action)\s*:\s*(?:async\s+)?\(\s*{\s*params\s*}\s*\)/g;
  if (loaderParamsRegex.test(code)) {
    // Could extract further by analyzing the params object usage
  }

  return params;
}

/**
 * Extract form-related patterns.
 */
function extractFormPatterns(code) {
  const patterns = {
    usesFormData: /new\s+FormData\(/.test(code),
    usesFormDataMethod: /formData\.get\(/.test(code) || /formData\.getAll\(/.test(code),
    usesFormSubmit: /onSubmit|<Form/.test(code),
    usesRedirect: /redirect\(/.test(code),
    usesJsonResponse: /json\(/.test(code),
  };

  return patterns;
}

/**
 * ReactRouter Extractor Plugin
 */
export const ReactRouterExtractor = {
  name: "ReactRouterExtractor",
  extensions: [".tsx", ".jsx", ".ts", ".js"],
  priority: 10, // Higher than TypeScriptStrategy to override it

  async extract(code, filePath) {
    // First, get the base TypeScript extraction
    const { blocks, metadata } = await TypeScriptStrategy.extract(code, filePath);

    // Only add Remix/React Router metadata for route files
    const isRoute = isRouteFile(filePath);
    const routeName = extractRouteName(filePath);
    const routeExports = extractRouteExports(code);
    const navigation = extractNavigationDependencies(code);
    const routeParams = extractRouteParams(code);
    const formPatterns = extractFormPatterns(code);

    // Get imports from React Router/Remix
    const reactRouterImports = metadata.imports.filter(imp =>
      imp.source.startsWith("@remix-run/") ||
      imp.source.startsWith("react-router") ||
      imp.source === "react-router-dom"
    );

    return {
      blocks,
      metadata: {
        ...metadata,
        framework: isRoute ? "react-router" : undefined,
        reactRouter: isRoute ? {
          routeName,
          routeExports,
          navigation,
          routeParams,
          formPatterns,
          reactRouterImports,
        } : undefined
      }
    };
  }
};

/**
 * ReactRouter Plugin Definition
 */
const plugin = {
  name: "react-router",
  version: "1.0.0",
  apiVersion: "1.0.0",
  description: "React Router v7 / Remix framework support for VibeScout",

  extractors: [ReactRouterExtractor]
};

export default plugin;
