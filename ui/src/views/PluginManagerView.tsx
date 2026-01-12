import { useState, useEffect } from "react";
import {
  Download,
  Trash2,
  Power,
  PowerOff,
  RefreshCw,
  Plus,
  Check,
  X,
  AlertCircle,
  Package,
  Loader2,
  Info,
  ExternalLink,
  FolderOpen,
  Github,
  Upload,
  Globe,
  Zap,
  Code,
  Database,
  Terminal,
} from "lucide-react";
import axios from "axios";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { notify } from "../utils/events";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Plugin {
  name: string;
  version: string;
  source: "builtin" | "npm" | "local";
  path: string;
  enabled: boolean;
  loaded: boolean;
  installed: boolean;
  error?: string;
  overridden?: string;
  incompatible?: string;
  runtime?: {
    active: boolean;
    extractors: number;
    providers: number;
    commands: number;
  };
  manifest?: {
    vibescout?: {
      apiVersion: string;
      capabilities?: string[];
      compatibility?: {
        vibescoutMin?: string;
        vibescoutMax?: string;
      };
      builtin?: boolean;
    };
    description?: string;
    author?: string;
    homepage?: string;
    keywords?: string[];
    license?: string;
  };
}

type InstallSource = "npm" | "github" | "zip";

export default function PluginManagerView() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [installSource, setInstallSource] = useState<InstallSource>("npm");
  const [installData, setInstallData] = useState({
    npm: "",
    version: "latest", // Add version field
    github: "",
    zip: null as File | null,
  });
  const [installing, setInstalling] = useState(false);
  const [pluginsDir, setPluginsDir] = useState<{ path: string; exists: boolean } | null>(null);

  const fetchPlugins = async () => {
    try {
      const response = await axios.get("/api/plugins");
      setPlugins(response.data);
    } catch (error) {
      console.error("Failed to fetch plugins:", error);
      notify("error", "Failed to load plugins");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchPluginsDir = async () => {
    try {
      const response = await axios.get("/api/plugins/dir/info");
      setPluginsDir(response.data);
    } catch (error) {
      console.error("Failed to fetch plugins dir:", error);
    }
  };

  const createPluginsDir = async () => {
    try {
      await axios.post("/api/plugins/dir/create");
      notify("success", "Plugins directory created");
      fetchPluginsDir();
    } catch (error: any) {
      notify("error", error.response?.data?.error || "Failed to create directory");
    }
  };

  useEffect(() => {
    fetchPlugins();
    fetchPluginsDir();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchPlugins();
    notify("success", "Plugins refreshed");
  };

  const handleTogglePlugin = async (plugin: Plugin) => {
    const action = plugin.enabled ? "disable" : "enable";
    try {
      await axios.post(`/api/plugins/${plugin.name}/${action}`);
      notify("success", `Plugin ${plugin.name} ${action}d`);
      await fetchPlugins();
    } catch (error: any) {
      notify("error", error.response?.data?.error || `Failed to ${action} plugin`);
    }
  };

  const handleUninstall = async (plugin: Plugin) => {
    if (!confirm(`Are you sure you want to uninstall ${plugin.name}? This will remove the plugin from your system.`)) {
      return;
    }

    try {
      await axios.delete(`/api/plugins/${plugin.name}`);
      notify("success", `Plugin ${plugin.name} uninstalled`);
      await fetchPlugins();
    } catch (error: any) {
      notify("error", error.response?.data?.error || "Failed to uninstall plugin");
    }
  };

  const handleInstall = async (e: React.FormEvent) => {
    e.preventDefault();

    setInstalling(true);
    try {
      if (installSource === "npm") {
        if (!installData.npm.trim()) return;
        await axios.post("/api/plugins/install", {
          name: installData.npm,
          version: installData.version || "latest",
          source: "npm",
        });
      } else if (installSource === "github") {
        if (!installData.github.trim()) return;
        await axios.post("/api/plugins/install", {
          url: installData.github,
          source: "github",
        });
      } else if (installSource === "zip") {
        if (!installData.zip) return;
        const formData = new FormData();
        formData.append("file", installData.zip);
        await axios.post("/api/plugins/install", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      notify("success", "Plugin installed successfully");
      setInstallModalOpen(false);
      setInstallData({ npm: "", version: "latest", github: "", zip: null });
      await fetchPlugins();
    } catch (error: any) {
      notify("error", error.response?.data?.error || "Failed to install plugin");
    } finally {
      setInstalling(false);
    }
  };

  const getStatusBadge = (plugin: Plugin) => {
    if (plugin.incompatible) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" title={plugin.incompatible}>
          <AlertCircle className="w-3.5 h-3.5" />
          Incompatible
        </span>
      );
    }

    if (plugin.error) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
          <AlertCircle className="w-3.5 h-3.5" />
          Error
        </span>
      );
    }

    // Simply show Enabled or Disabled
    if (plugin.enabled) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
          <Check className="w-3.5 h-3.5" />
          Enabled
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">
        <PowerOff className="w-3.5 h-3.5" />
        Disabled
      </span>
    );
  };

  const getCapabilityIcon = (cap: string) => {
    switch (cap.toLowerCase()) {
      case "extractors":
        return <Code className="w-3.5 h-3.5" />;
      case "providers":
        return <Database className="w-3.5 h-3.5" />;
      case "commands":
        return <Terminal className="w-3.5 h-3.5" />;
      default:
        return <Zap className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="p-8 space-y-8 max-w-5xl mx-auto w-full pb-20">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary rounded-2xl text-primary-foreground shadow-lg shadow-primary/20">
              <Package className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                Plugin Manager
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Browse and manage VibeScout plugins
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className={cn(
                "px-5 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2",
                "bg-card border-2 border-border",
                refreshing ? "opacity-50" : "hover:bg-secondary hover:border-border"
              )}
            >
              <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
              Refresh
            </button>
            <button
              onClick={() => setInstallModalOpen(true)}
              className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition-all flex items-center gap-2 shadow-lg shadow-primary/20"
            >
              <Plus className="w-4 h-4" />
              Add Plugin
            </button>
          </div>
        </div>
      </div>

      {/* Plugins Directory Notice */}
      {pluginsDir && !pluginsDir.exists && (
        <div className="mb-6 p-5 bg-card border-2 border-border rounded-2xl">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-primary/10 rounded-xl">
              <FolderOpen className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-foreground">
                Local plugins directory not found
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Create <code className="px-2 py-1 bg-secondary rounded text-xs font-mono">
                  {pluginsDir.path}
                </code>{" "}
                to add local plugins.
              </p>
              <button
                onClick={createPluginsDir}
                className="mt-3 px-4 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:opacity-90 transition-all"
              >
                Create Directory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plugin List */}
      <div className="bg-card rounded-2xl border-2 border-border overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-secondary border-b-2 border-border text-xs font-bold text-muted-foreground uppercase tracking-widest">
          <div className="col-span-4">Plugin</div>
          <div className="col-span-2">Version</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Capabilities</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : plugins.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex p-4 bg-secondary rounded-2xl mb-4">
              <Package className="w-12 h-12 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">
              No plugins found
            </h3>
            <p className="text-muted-foreground mb-4 max-w-sm mx-auto">
              Install plugins to extend VibeScout functionality with custom extractors, providers, and commands.
            </p>
            <button
              onClick={() => setInstallModalOpen(true)}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition-all"
            >
              Browse Plugins
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {plugins.map((plugin) => (
              <div
                key={plugin.name}
                className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-secondary/50 transition-colors"
              >
                {/* Plugin Name & Description */}
                <div className="col-span-4">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "p-2 rounded-xl shrink-0",
                      plugin.installed && plugin.loaded && plugin.enabled
                        ? "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400"
                        : plugin.installed
                          ? "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400"
                          : "bg-secondary text-muted-foreground"
                    )}>
                      <Package className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-bold text-foreground truncate">
                          {plugin.name}
                        </h3>
                        {plugin.installed && (
                          <Check className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                        )}
                        {plugin.overridden && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                            title={`Overriding built-in plugin: ${plugin.overridden}`}
                          >
                            <AlertCircle className="w-3 h-3" />
                            Override
                          </span>
                        )}
                      </div>
                      {plugin.manifest?.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {plugin.manifest.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        {plugin.manifest?.author && (
                          <span className="text-xs text-muted-foreground">
                            by {plugin.manifest.author}
                          </span>
                        )}
                        {plugin.source === "npm" && (
                          <>
                            <span className="text-muted-foreground/50">·</span>
                            <a
                              href={`https://www.npmjs.com/package/${plugin.name}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              <Globe className="w-3 h-3" />
                              npm
                            </a>
                          </>
                        )}
                        {plugin.manifest?.homepage && (
                          <>
                            <span className="text-muted-foreground/50">·</span>
                            <a
                              href={plugin.manifest.homepage}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              docs
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Version */}
                <div className="col-span-2">
                  <code className="text-sm font-mono text-foreground bg-secondary px-2 py-1 rounded">
                    {plugin.version}
                  </code>
                  {plugin.manifest?.vibescout?.apiVersion && (
                    <div className="text-xs text-muted-foreground mt-1">
                      API {plugin.manifest.vibescout.apiVersion}
                    </div>
                  )}
                </div>

                {/* Status */}
                <div className="col-span-2">
                  {getStatusBadge(plugin)}
                  {plugin.error && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 truncate" title={plugin.error}>
                      {plugin.error}
                    </p>
                  )}
                </div>

                {/* Capabilities */}
                <div className="col-span-2">
                  {plugin.manifest?.vibescout?.capabilities ? (
                    <div className="flex flex-wrap gap-1.5">
                      {plugin.manifest.vibescout.capabilities.slice(0, 3).map((cap) => (
                        <span
                          key={cap}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-secondary rounded-lg text-xs text-foreground"
                          title={cap}
                        >
                          {getCapabilityIcon(cap)}
                        </span>
                      ))}
                      {plugin.manifest.vibescout.capabilities.length > 3 && (
                        <span className="text-xs text-muted-foreground">
                          +{plugin.manifest.vibescout.capabilities.length - 3}
                        </span>
                      )}
                    </div>
                  ) : plugin.runtime ? (
                    <div className="flex flex-wrap gap-1.5">
                      {plugin.runtime.extractors > 0 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 dark:bg-blue-900/40 rounded-lg text-xs text-blue-700 dark:text-blue-300">
                          <Code className="w-3 h-3" />
                          {plugin.runtime.extractors}
                        </span>
                      )}
                      {plugin.runtime.providers > 0 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 dark:bg-green-900/40 rounded-lg text-xs text-green-700 dark:text-green-300">
                          <Database className="w-3 h-3" />
                          {plugin.runtime.providers}
                        </span>
                      )}
                      {plugin.runtime.commands > 0 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-100 dark:bg-purple-900/40 rounded-lg text-xs text-purple-700 dark:text-purple-300">
                          <Terminal className="w-3 h-3" />
                          {plugin.runtime.commands}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </div>

                {/* Actions */}
                <div className="col-span-2">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleTogglePlugin(plugin)}
                      disabled={!!plugin.error || plugin.incompatible !== undefined}
                      className={cn(
                        "px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 shadow-sm hover:shadow",
                        plugin.enabled
                          ? "bg-gray-500 text-white hover:bg-gray-600 shadow-gray-500/30"
                          : "bg-blue-500 text-white hover:bg-blue-600 shadow-blue-500/30",
                        (plugin.error || plugin.incompatible) && "opacity-50 cursor-not-allowed hover:shadow-none"
                      )}
                      title={plugin.enabled ? "Click to disable this plugin" : "Click to enable this plugin"}
                    >
                      {plugin.enabled ? (
                        <>
                          <PowerOff className="w-4 h-4" />
                          Disable
                        </>
                      ) : (
                        <>
                          <Power className="w-4 h-4" />
                          Enable
                        </>
                      )}
                    </button>
                    {plugin.source === "npm" && (
                      <button
                        onClick={() => handleUninstall(plugin)}
                        className="px-4 py-2 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 shadow-sm shadow-red-500/30 hover:shadow transition-all flex items-center gap-2"
                        title="Remove this plugin from your system"
                      >
                        <Trash2 className="w-4 h-4" />
                        Uninstall
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Install Modal */}
      {installModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden">
            {/* Header */}
            <div className="bg-primary p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-primary-foreground flex items-center gap-2">
                    <Download className="w-5 h-5" />
                    Install Plugin
                  </h3>
                  <p className="text-sm text-primary-foreground/80 mt-1">
                    Choose installation source and provide plugin details
                  </p>
                </div>
                <button
                  onClick={() => setInstallModalOpen(false)}
                  className="p-2 bg-primary-foreground/20 hover:bg-primary-foreground/30 rounded-xl transition-all"
                >
                  <X className="w-5 h-5 text-primary-foreground" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b-2 border-border">
              <div className="grid grid-cols-3">
                <button
                  onClick={() => setInstallSource("npm")}
                  className={cn(
                    "px-6 py-4 text-sm font-bold transition-all flex items-center justify-center gap-2",
                    installSource === "npm"
                      ? "bg-primary/10 text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  )}
                >
                  <Globe className="w-4 h-4" />
                  npm Package
                </button>
                <button
                  onClick={() => setInstallSource("github")}
                  className={cn(
                    "px-6 py-4 text-sm font-bold transition-all flex items-center justify-center gap-2",
                    installSource === "github"
                      ? "bg-primary/10 text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  )}
                >
                  <Github className="w-4 h-4" />
                  GitHub
                </button>
                <button
                  onClick={() => setInstallSource("zip")}
                  className={cn(
                    "px-6 py-4 text-sm font-bold transition-all flex items-center justify-center gap-2",
                    installSource === "zip"
                      ? "bg-primary/10 text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  )}
                >
                  <Upload className="w-4 h-4" />
                  ZIP File
                </button>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleInstall} className="p-6">
              {installSource === "npm" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-foreground mb-2">
                      Plugin Name
                    </label>
                    <input
                      type="text"
                      value={installData.npm}
                      onChange={(e) => setInstallData({ ...installData, npm: e.target.value })}
                      placeholder="e.g., nextjs, react-router, vue"
                      className="w-full px-4 py-3 border-2 border-border rounded-xl bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent transition-all font-medium"
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5" />
                      Will be prefixed with "vibescout-plugin-" if not already present
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-foreground mb-2">
                      Version
                    </label>
                    <select
                      value={installData.version}
                      onChange={(e) => setInstallData({ ...installData, version: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-border rounded-xl bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent transition-all font-medium"
                    >
                      <option value="latest">latest (stable)</option>
                      <option value="beta">beta (pre-release)</option>
                      <option value="next">next (canary)</option>
                      <option value="custom">Custom version...</option>
                    </select>

                    {installData.version === "custom" && (
                      <input
                        type="text"
                        placeholder="e.g., 1.2.3, ^2.0.0"
                        className="w-full mt-2 px-4 py-3 border-2 border-border rounded-xl bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent transition-all font-medium"
                        onChange={(e) => setInstallData({ ...installData, version: e.target.value })}
                      />
                    )}
                  </div>
                </div>
              )}

              {installSource === "github" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-foreground mb-2">
                      GitHub Repository URL
                    </label>
                    <input
                      type="text"
                      value={installData.github}
                      onChange={(e) => setInstallData({ ...installData, github: e.target.value })}
                      placeholder="https://github.com/user/vibescout-plugin-name"
                      className="w-full px-4 py-3 border-2 border-border rounded-xl bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent transition-all font-mono text-sm"
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                      <Github className="w-3.5 h-3.5" />
                      Provide the full GitHub repository URL
                    </p>
                  </div>
                </div>
              )}

              {installSource === "zip" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-foreground mb-2">
                      Select ZIP File
                    </label>
                    <div className="relative">
                      <input
                        type="file"
                        accept=".zip"
                        onChange={(e) => setInstallData({ ...installData, zip: e.target.files?.[0] || null })}
                        className="hidden"
                        id="zip-upload"
                      />
                      <label
                        htmlFor="zip-upload"
                        className="flex items-center justify-center gap-3 w-full px-6 py-8 border-2 border-dashed border-border rounded-xl bg-secondary/50 hover:border-primary transition-all cursor-pointer"
                      >
                        {installData.zip ? (
                          <>
                            <div className="p-2 bg-green-100 dark:bg-green-800 rounded-lg">
                              <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-bold text-foreground">
                                {installData.zip.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {(installData.zip.size / 1024).toFixed(1)} KB
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="p-2 bg-secondary rounded-lg">
                              <Upload className="w-5 h-5 text-muted-foreground" />
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-bold text-foreground">
                                Click to upload
                              </p>
                              <p className="text-xs text-muted-foreground">
                                or drag and drop ZIP file here
                              </p>
                            </div>
                          </>
                        )}
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 justify-end mt-6 pt-6 border-t-2 border-border">
                <button
                  type="button"
                  onClick={() => setInstallModalOpen(false)}
                  className="px-5 py-2.5 border-2 border-border rounded-xl font-bold hover:bg-secondary transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={installing}
                  className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg"
                >
                  {installing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Installing...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Install Plugin
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
