import fs from 'fs-extra';
import path from 'path';
import { logger } from './logger.js';

export type FrameworkType = 'nextjs' | 'react-router' | 'vue' | 'angular' | 'svelte' | 'nuxt' | 'remix' | 'express' | 'fastify' | 'nestjs' | 'none';

export interface FrameworkDetection {
  framework: FrameworkType | null;
  version?: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
}

/**
 * Detect the framework used in a project
 * @param projectPath Absolute path to the project
 * @returns Framework detection result
 */
export async function detectFramework(projectPath: string): Promise<FrameworkDetection> {
  const evidence: string[] = [];
  let framework: FrameworkType = 'none';
  let confidence: 'high' | 'medium' | 'low' = 'low';
  let version: string | undefined;

  try {
    const pkgPath = path.join(projectPath, 'package.json');

    if (!await fs.pathExists(pkgPath)) {
      return { framework: null, confidence: 'low', evidence: [] };
    }

    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    // Next.js detection
    if (deps.next) {
      framework = 'nextjs';
      confidence = 'high';
      evidence.push('next in dependencies');
      version = deps.next;

      // Check for Next.js specific files
      const hasPagesDir = await fs.pathExists(path.join(projectPath, 'pages'));
      const hasAppDir = await fs.pathExists(path.join(projectPath, 'app'));
      const hasNextConfig = await fs.pathExists(path.join(projectPath, 'next.config.js')) ||
                          await fs.pathExists(path.join(projectPath, 'next.config.mjs'));

      if (hasAppDir) evidence.push('app/ directory found (App Router)');
      if (hasPagesDir) evidence.push('pages/ directory found (Pages Router)');
      if (hasNextConfig) evidence.push('next.config.* found');
    }

    // React Router detection
    if (deps['react-router'] || deps['react-router-dom']) {
      if (framework === 'none') {
        framework = 'react-router';
        confidence = deps['react-router-dom'] ? 'high' : 'medium';
        version = deps['react-router-dom'] || deps['react-router'];
        evidence.push('react-router in dependencies');
      }
    }

    // Remix detection
    if (deps['@remix-run/react'] || deps.remix) {
      framework = 'remix';
      confidence = 'high';
      version = deps['@remix-run/react'] || deps.remix;
      evidence.push('@remix-run/react in dependencies');
    }

    // Vue detection
    if (deps.vue) {
      framework = 'vue';
      confidence = 'high';
      version = deps.vue;
      evidence.push('vue in dependencies');
    }

    // Nuxt detection
    if (deps.nuxt) {
      framework = 'nuxt';
      confidence = 'high';
      version = deps.nuxt;
      evidence.push('nuxt in dependencies');
    }

    // Angular detection
    if (deps['@angular/core']) {
      framework = 'angular';
      confidence = 'high';
      version = deps['@angular/core'];
      evidence.push('@angular/core in dependencies');
    }

    // Svelte detection
    if (deps.svelte) {
      framework = 'svelte';
      confidence = 'high';
      version = deps.svelte;
      evidence.push('svelte in dependencies');
    }

    // Express detection
    if (deps.express) {
      if (framework === 'none') {
        framework = 'express';
        confidence = 'medium';
        version = deps.express;
        evidence.push('express in dependencies');
      }
    }

    // Fastify detection
    if (deps.fastify) {
      if (framework === 'none') {
        framework = 'fastify';
        confidence = 'medium';
        version = deps.fastify;
        evidence.push('fastify in dependencies');
      }
    }

    // NestJS detection
    if (deps['@nestjs/core']) {
      if (framework === 'none') {
        framework = 'nestjs';
        confidence = 'high';
        version = deps['@nestjs/core'];
        evidence.push('@nestjs/core in dependencies');
      }
    }

    // Check for framework-specific configuration files
    const configFiles = await fs.readdir(projectPath).catch(() => []) as string[];

    if (configFiles.includes('angular.json')) {
      framework = 'angular';
      confidence = 'high';
      evidence.push('angular.json found');
    }

    if (configFiles.includes('remix.config.js')) {
      framework = 'remix';
      confidence = 'high';
      evidence.push('remix.config.js found');
    }

    if (configFiles.includes('nuxt.config.js') || configFiles.includes('nuxt.config.ts')) {
      framework = 'nuxt';
      confidence = 'high';
      evidence.push('nuxt.config.* found');
    }

    if (configFiles.includes('svelte.config.js')) {
      if (framework === 'none' || framework === 'vue') {
        framework = 'svelte';
        confidence = 'high';
        evidence.push('svelte.config.js found');
      }
    }

    logger.debug(`[Framework Detection] Detected: ${framework || 'none'} (${confidence}) for ${projectPath}`);

    return {
      framework: framework === 'none' ? null : framework,
      version,
      confidence,
      evidence
    };

  } catch (error: any) {
    logger.warn(`[Framework Detection] Failed to detect framework: ${error.message}`);
    return { framework: null, confidence: 'low', evidence: [] };
  }
}

/**
 * Get the plugin name for a detected framework
 * @param framework Framework type
 * @returns Plugin name
 */
export function getPluginNameForFramework(framework: FrameworkType | null): string | null {
  const pluginMap: Record<string, string | null> = {
    'nextjs': 'nextjs',
    'react-router': 'react-router',
    'vue': 'vue',
    'nuxt': 'nuxt',
    'angular': 'angular',
    'svelte': 'svelte',
    'remix': 'remix',
    'express': 'express',
    'fastify': 'fastify',
    'nestjs': 'nestjs',
    'none': null
  };

  const key = framework || 'none';
  const pluginBase = pluginMap[key];
  return pluginBase ? `vibescout-plugin-${pluginBase}` : null;
}