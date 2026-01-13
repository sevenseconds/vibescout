import { useState, useEffect } from 'react';
import { Activity, Play, Square, Download, Trash2, Settings, BarChart3 } from 'lucide-react';
import axios from 'axios';
import { notify } from '../utils/events';

interface TraceFile {
  filename: string;
  id: string;
  size: number;
  created: Date;
  eventCount: number;
  startTime: string;
  endTime: string;
}

interface ProfilerStats {
  enabled: boolean;
  samplingRate: number;
  bufferedEvents: number;
  sessionStart: string | null;
  outputDir: string;
}

export default function PerformanceView() {
  const [isProfiling, setIsProfiling] = useState(false);
  const [samplingRate, setSamplingRate] = useState(1.0);
  const [recentTraces, setRecentTraces] = useState<TraceFile[]>([]);
  const [stats, setStats] = useState<ProfilerStats | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch profiling status and recent traces on mount
  useEffect(() => {
    fetchStatus();
    fetchTraces();
  }, []);

  const fetchStatus = async () => {
    try {
      const { data } = await axios.get('/api/profiling/status');
      setStats(data.stats);
      setIsProfiling(data.enabled);
    } catch (error) {
      console.error('Failed to fetch profiling status:', error);
    }
  };

  const fetchTraces = async () => {
    try {
      const { data } = await axios.get('/api/profiling/traces');
      setRecentTraces(data.traces.map((t: any) => ({
        ...t,
        created: new Date(t.created)
      })));
    } catch (error) {
      console.error('Failed to fetch traces:', error);
    }
  };

  const startProfiling = async () => {
    setLoading(true);
    try {
      await axios.post('/api/profiling/start', {
        samplingRate,
        categories: ['indexing', 'search', 'embedding', 'database', 'mcp', 'git', 'filesystem']
      });
      setIsProfiling(true);
      await fetchStatus();
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message;
      console.error('Failed to start profiling:', errorMsg, error);
      notify('error', `Failed to start profiling: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const stopProfiling = async () => {
    setLoading(true);
    try {
      const { data } = await axios.post('/api/profiling/stop');
      setIsProfiling(false);
      await fetchStatus();
      await fetchTraces();

      if (data.success) {
        notify('success', `Profiling stopped! Collected ${data.trace.eventCount} events.`);
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message;
      console.error('Failed to stop profiling:', errorMsg, error);
      notify('error', `Failed to stop profiling: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const downloadTrace = async (id: string) => {
    try {
      const response = await axios.get(`/api/profiling/download?id=${id}`);
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vibescout-profile-${id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message;
      console.error('Failed to download trace:', errorMsg, error);
      notify('error', `Failed to download trace: ${errorMsg}`);
    }
  };

  const deleteTrace = async (id: string) => {
    if (!confirm('Are you sure you want to delete this trace file?')) {
      return;
    }

    try {
      await axios.delete(`/api/profiling/traces?id=${id}`);
      notify('success', 'Trace file deleted successfully');
      await fetchTraces();
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message;
      console.error('Failed to delete trace:', errorMsg, error);
      notify('error', `Failed to delete trace: ${errorMsg}`);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Activity className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Performance Profiling</h1>
        </div>
      </div>

      {/* Top Section: Instructions (Left) + Controls (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Instructions - Left Column */}
        <div className="lg:col-span-1 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            How to View Flame Graphs
          </h3>
          <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1.5 list-decimal list-inside">
            <li>Download a trace file</li>
            <li>Open Chrome: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded text-xs">chrome://tracing</code></li>
            <li>Click "Load" and select the file</li>
            <li>Zoom and pan through the graph</li>
            <li>Hover over events for details</li>
          </ol>
        </div>

        {/* Profiling Controls - Right Column */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Profiling Controls
          </h2>

          <div className="space-y-4">
            {/* Sampling Rate Control */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Sampling Rate: {Math.round(samplingRate * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={samplingRate}
                onChange={(e) => setSamplingRate(parseFloat(e.target.value))}
                disabled={isProfiling}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 disabled:opacity-50"
              />
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>0% (lowest overhead)</span>
                <span>100% (most detailed)</span>
              </div>
            </div>

            {/* Start/Stop Button */}
            <div>
              {!isProfiling ? (
                <button
                  onClick={startProfiling}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Play className="w-4 h-4" />
                  Start Profiling
                </button>
              ) : (
                <button
                  onClick={stopProfiling}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Square className="w-4 h-4" />
                  Stop Profiling
                </button>
              )}
            </div>

            {/* Status Display */}
            {stats && (
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Status:</span>
                    <span className={`ml-2 font-medium ${isProfiling ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                      {isProfiling ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Buffered Events:</span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-white">{stats.bufferedEvents}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Sampling Rate:</span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-white">{Math.round(stats.samplingRate * 100)}%</span>
                  </div>
                  {stats.sessionStart && (
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Started:</span>
                      <span className="ml-2 font-medium text-gray-900 dark:text-white text-xs">
                        {formatDate(new Date(stats.sessionStart))}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Traces - Full Width */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Recent Trace Files
        </h2>

        {recentTraces.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No trace files yet. Start profiling to collect performance data.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentTraces.map((trace) => (
              <div
                key={trace.id}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-medium text-gray-900 dark:text-white">
                      {trace.filename}
                    </h3>
                    <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full">
                      {trace.eventCount} events
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 flex gap-4">
                    <span>{formatDate(trace.created)}</span>
                    <span>{formatBytes(trace.size)}</span>
                    {trace.startTime && (
                      <span>
                        {new Date(trace.endTime).getTime() - new Date(trace.startTime).getTime()}ms duration
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => downloadTrace(trace.id)}
                    className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                    title="Download trace file"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => deleteTrace(trace.id)}
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                    title="Delete trace file"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
