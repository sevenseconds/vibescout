/**
 * NextJS Plugin for VibeScout
 *
 * This plugin extends VibeScout to extract Next.js-specific metadata:
 * - Route types (page, layout, loading, error, not-found, template)
 * - Navigation dependencies (Link, router.push, redirect)
 * - Server actions ("use server" directive)
 * - API routes
 */

import path from "path";
import { TypeScriptStrategy } from "../../../extractors/TypeScriptStrategy.js";

/**
 * Detect Next.js route type from file path.
 */
function detectNextRouteType(filePath) {
  const segments = filePath.split(path.sep);

  // Check for API routes
  if (segments.includes("api")) {
    return "api";
  }

  const filename = segments[segments.length - 1];

  // Check for special Next.js files
  if (filename === "page.tsx" || filename === "page.jsx" || filename === "page.js") {
    return "page";
  }
  if (filename === "layout.tsx" || filename === "layout.jsx" || filename === "layout.js") {
    return "layout";
  }
  if (filename === "loading.tsx" || filename === "loading.jsx" || filename === "loading.js") {
    return "loading";
  }
  if (filename === "error.tsx" || filename === "error.jsx" || filename === "error.js") {
    return "error";
  }
  if (filename === "not-found.tsx" || filename === "not-found.jsx" || filename === "not-found.js") {
    return "not-found";
  }
  if (filename === "template.tsx" || filename === "template.jsx" || filename === "template.js") {
    return "template";
  }

  // Check for dynamic routes
  if (filename.startsWith("[") && filename.includes("]")) {
    return "dynamic";
  }

  return "component";
}

/**
 * Extract Next.js navigation dependencies.
 */
function extractNavigationDependencies(code) {
  const dependencies = [];

  // Find <Link href="..."> patterns
  const linkRegex = /<Link\s+(?:[^>]*?\s+)?href\s*=\s*["']([^"']+)["']/g;
  let match;
  while ((match = linkRegex.exec(code)) !== null) {
    dependencies.push({
      type: "link",
      target: match[1],
      component: "Link"
    });
  }

  // Find router.push("/path") patterns
  const routerPushRegex = /router\.push\(["']([^"']+)["']\)/g;
  while ((match = routerPushRegex.exec(code)) !== null) {
    dependencies.push({
      type: "navigation",
      target: match[1],
      method: "push"
    });
  }

  // Find router.replace("/path") patterns
  const routerReplaceRegex = /router\.replace\(["']([^"']+)["']\)/g;
  while ((match = routerReplaceRegex.exec(code)) !== null) {
    dependencies.push({
      type: "navigation",
      target: match[1],
      method: "replace"
    });
  }

  // Find redirect("/path") patterns (server-side)
  const redirectRegex = /redirect\(["']([^"']+)["'](?:,\s*(\d+))?\)/g;
  while ((match = redirectRegex.exec(code)) !== null) {
    dependencies.push({
      type: "redirect",
      target: match[1],
      statusCode: match[2] ? parseInt(match[2]) : 307
    });
  }

  return dependencies;
}

/**
 * Extract Next.js server actions.
 */
function extractServerActions(code, blocks) {
  const serverActions = [];

  // Check for "use server" directive at file level
  const hasUseServer = code.includes("\"use server\"") || code.includes("'use server'");

  if (hasUseServer) {
    // All exported functions are server actions
    blocks.forEach(block => {
      if (block.type === "function" || block.type === "method") {
        serverActions.push({
          name: block.name,
          startLine: block.startLine,
          endLine: block.endLine
        });
      }
    });
  }

  return serverActions;
}

/**
 * Extract Next.js data fetching methods.
 */
function extractDataFetching(code) {
  const dataFetching = {
    hasServerComponent: code.includes("\"use server\"") || code.includes("'use server'"),
    hasClientComponent: code.includes("\"use client\"") || code.includes("'use client'"),
    hasGetStaticProps: false,
    hasGetServerSideProps: false,
    hasGetStaticPaths: false,
  };

  // Pages router data fetching
  dataFetching.hasGetStaticProps = code.includes("getStaticProps");
  dataFetching.hasGetServerSideProps = code.includes("getServerSideProps");
  dataFetching.hasGetStaticPaths = code.includes("getStaticPaths");

  // App router server components (default)
  if (!dataFetching.hasClientComponent && !dataFetching.hasServerComponent) {
    // In app dir, files are server components by default
    // But we can't determine this from just the code - need file path
  }

  return dataFetching;
}

/**
 * NextJS Extractor Plugin
 */
export const NextJSExtractor = {
  name: "NextJSExtractor",
  extensions: [".tsx", ".jsx", ".ts", ".js"],
  priority: 10, // Higher than TypeScriptStrategy to override it

  async extract(code, filePath) {
    // First, get the base TypeScript extraction
    const { blocks, metadata } = await TypeScriptStrategy.extract(code, filePath);

    // Then add Next.js-specific metadata
    const routeType = detectNextRouteType(filePath);
    const navigation = extractNavigationDependencies(code);
    const serverActions = extractServerActions(code, blocks);
    const dataFetching = extractDataFetching(code);

    // Get imports from Next.js
    const nextImports = metadata.imports.filter(imp =>
      imp.source.startsWith("next/") ||
      imp.source === "next" ||
      imp.source.startsWith("@next/")
    );

    return {
      blocks,
      metadata: {
        ...metadata,
        framework: "nextjs",
        nextjs: {
          routeType,
          navigation,
          serverActions,
          dataFetching,
          nextImports,
          isAppDir: filePath.includes("/app/"),
          isPagesDir: filePath.includes("/pages/"),
        }
      }
    };
  }
};

/**
 * NextJS Plugin Definition
 */
const plugin = {
  name: "nextjs",
  version: "1.0.0",
  apiVersion: "1.0.0",
  description: "Next.js framework support for VibeScout",

  extractors: [NextJSExtractor]
};

export default plugin;
