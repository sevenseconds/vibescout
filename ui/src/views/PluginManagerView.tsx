import { useState, useEffect } from "react";
import {
  Box,
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
  source: "npm" | "local";
  path: string;
  enabled: boolean;
  loaded: boolean;
  error?: string;
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
    };
    description?: string;
    author?: string;
    homepage?: string;
  };
}

export default function PluginManagerView() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [installName, setInstallName] = useState("");
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
    if (!confirm(`Are you sure you want to uninstall ${plugin.name}?`)) {
      return;
    }

    try {
      await axios.delete(`/api/plugins/${plugin.name}`);
      notify("success", `Plugin ${plugin.name} uninstalled`);
      setSelectedPlugin(null);
      await fetchPlugins();
    } catch (error: any) {
      notify("error", error.response?.data?.error || "Failed to uninstall plugin");
    }
  };

  const handleInstall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!installName.trim()) return;

    setInstalling(true);
    try {
      await axios.post("/api/plugins/install", { name: installName, source: "npm" });
      notify("success", `Plugin ${installName} installed successfully`);
      setInstallModalOpen(false);
      setInstallName("");
      await fetchPlugins();
    } catch (error: any) {
      notify("error", error.response?.data?.error || "Failed to install plugin");
    } finally {
      setInstalling(false);
    }
  };

  const getStatusBadge = (plugin: Plugin) => {
    if (plugin.error) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
          <AlertCircle className="w-3 h-3 mr-1" />
          Error
        </span>
      );
    }

    if (!plugin.loaded) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
          Not Loaded
        </span>
      );
    }

    if (plugin.enabled) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <Check className="w-3 h-3 mr-1" />
          Active
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
          <PowerOff className="w-3 h-3 mr-1" />
          Disabled
        </span>
      );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Box className="w-6 h-6" />
            Plugin Manager
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Manage VibeScout plugins for custom extractors, providers, and commands
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
            Refresh
          </button>
          <button
            onClick={() => setInstallModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Install Plugin
          </button>
        </div>
      </div>

      {/* Plugins Directory Notice */}
      {pluginsDir && !pluginsDir.exists && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-start gap-3">
            <FolderOpen className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-blue-900 dark:text-blue-200">
                Local plugins directory not found
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                Create <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-800 rounded text-xs">
                  {pluginsDir.path}
                </code>{" "}
                to add local plugins.
              </p>
              <button
                onClick={createPluginsDir}
                className="mt-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
              >
                Create Directory
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Plugin List */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Installed Plugins ({plugins.length})
          </h2>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : plugins.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No plugins installed</p>
              <p className="text-sm mt-1">Install plugins to extend functionality</p>
            </div>
          ) : (
            <div className="space-y-2">
              {plugins.map((plugin) => (
                <button
                  key={plugin.name}
                  onClick={() => setSelectedPlugin(plugin)}
                  className={cn(
                    "w-full p-3 rounded-lg text-left transition-colors",
                    selectedPlugin?.name === plugin.name
                      ? "bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500"
                      : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {plugin.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        v{plugin.version} · {plugin.source}
                      </p>
                    </div>
                    {getStatusBadge(plugin)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Plugin Details */}
        <div className="lg:col-span-2">
          {selectedPlugin ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    {selectedPlugin.name}
                    {getStatusBadge(selectedPlugin)}
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Version {selectedPlugin.version} · {selectedPlugin.source}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleTogglePlugin(selectedPlugin)}
                    disabled={!!selectedPlugin.error}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                      selectedPlugin.enabled
                        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 hover:bg-yellow-200 dark:hover:bg-yellow-900/50"
                        : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50"
                    )}
                  >
                    {selectedPlugin.enabled ? (
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
                  {selectedPlugin.source === "npm" && (
                    <button
                      onClick={() => handleUninstall(selectedPlugin)}
                      className="px-3 py-1.5 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 rounded-lg text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors flex items-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                      Uninstall
                    </button>
                  )}
                </div>
              </div>

              {selectedPlugin.error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-900 dark:text-red-200">
                        Load Error
                      </p>
                      <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                        {selectedPlugin.error}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {/* Manifest Info */}
                {selectedPlugin.manifest?.vibescout && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-1.5">
                      <Info className="w-4 h-4" />
                      Plugin Information
                    </h3>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-gray-500 dark:text-gray-400">API Version</dt>
                        <dd className="text-gray-900 dark:text-white font-mono text-xs">
                          {selectedPlugin.manifest.vibescout.apiVersion}
                        </dd>
                      </div>
                      {selectedPlugin.manifest.vibescout.capabilities && (
                        <div>
                          <dt className="text-gray-500 dark:text-gray-400">Capabilities</dt>
                          <dd className="flex flex-wrap gap-1 mt-1">
                            {selectedPlugin.manifest.vibescout.capabilities.map((cap) => (
                              <span
                                key={cap}
                                className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs"
                              >
                                {cap}
                              </span>
                            ))}
                          </dd>
                        </div>
                      )}
                      {selectedPlugin.manifest.author && (
                        <div>
                          <dt className="text-gray-500 dark:text-gray-400">Author</dt>
                          <dd className="text-gray-900 dark:text-white">{selectedPlugin.manifest.author}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-gray-500 dark:text-gray-400">Path</dt>
                        <dd className="text-gray-900 dark:text-white font-mono text-xs break-all">
                          {selectedPlugin.path}
                        </dd>
                      </div>
                    </dl>
                  </div>
                )}

                {/* Runtime Status */}
                {selectedPlugin.runtime && selectedPlugin.loaded && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                      Runtime Status
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                          {selectedPlugin.runtime.extractors}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Extractors</p>
                      </div>
                      <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                          {selectedPlugin.runtime.providers}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Providers</p>
                      </div>
                      <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
                        <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                          {selectedPlugin.runtime.commands}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Commands</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Links */}
                {selectedPlugin.manifest?.homepage && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                      Resources
                    </h3>
                    <a
                      href={selectedPlugin.manifest.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Homepage
                    </a>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 flex flex-col items-center justify-center text-center">
              <Package className="w-16 h-16 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Select a plugin
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
                Choose a plugin from the list to view its details and manage its settings.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Install Modal */}
      {installModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Install Plugin
              </h3>
              <button
                onClick={() => setInstallModalOpen(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleInstall}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Plugin Name
                </label>
                <input
                  type="text"
                  value={installName}
                  onChange={(e) => setInstallName(e.target.value)}
                  placeholder="e.g., vue, svelte, nextjs"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Will be prefixed with "vibescout-plugin-" if not already present
                </p>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setInstallModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={installing || !installName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {installing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Installing...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Install
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-xs text-blue-900 dark:text-blue-200">
                <strong>Tip:</strong> Search for plugins on npm with the{" "}
                <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-800 rounded">
                  vibescout-plugin-
                </code>{" "}
                prefix.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
