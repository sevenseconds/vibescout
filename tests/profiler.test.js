import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { 
  startProfiling, 
  stopProfiling, 
  profileAsync, 
  isProfilerEnabled,
  configureProfiler
} from "../src/profiler-api.js";
import fs from "fs-extra";
import path from "path";
import os from "os";

describe("Profiler API", () => {
  const outputDir = path.join(os.homedir(), ".vibescout", "profiles-test");

  beforeEach(async () => {
    // Ensure fresh state
    vi.resetModules();
    await fs.remove(outputDir);
  });

  afterEach(async () => {
    await fs.remove(outputDir);
  });

  it("should enable and disable profiling", async () => {
    expect(isProfilerEnabled()).toBe(false);
    
    await startProfiling();
    expect(isProfilerEnabled()).toBe(true);
    
    await stopProfiling();
    expect(isProfilerEnabled()).toBe(false);
  });

  it("should export trace when stopped", async () => {
    await configureProfiler({
      enabled: true,
      outputDir
    });
    
    await profileAsync("test-op", async () => {
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    
    const traceInfo = await stopProfiling();
    
    expect(traceInfo).not.toBeNull();
    expect(traceInfo.eventCount).toBeGreaterThan(0);
    expect(traceInfo.filepath).toContain("vibescout-profile-");
    
    const traceExists = await fs.pathExists(traceInfo.filepath);
    expect(traceExists).toBe(true);
    
    const traceContent = await fs.readJson(traceInfo.filepath);
    expect(traceContent.traceEvents).toBeDefined();
    expect(traceContent.traceEvents.some(e => e.name === "test-op")).toBe(true);
  });

  it("should handle profileAsync without crashing", async () => {
    await startProfiling();
    
    const result = await profileAsync("async-op", async () => {
      return "success";
    });
    
    expect(result).toBe("success");
    await stopProfiling();
  });

  it("should return null from stopProfiling if no events recorded", async () => {
    await startProfiling();
    const traceInfo = await stopProfiling();
    expect(traceInfo).toBeNull();
  });
});
