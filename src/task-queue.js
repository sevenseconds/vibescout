/**
 * VibeScout Task Queue - In-memory queue for non-blocking indexing
 *
 * Features:
 * - Priority-based task queuing
 * - Concurrent task limits
 * - Auto-retry with exponential backoff
 * - Task cancellation support
 * - Progress tracking
 */

import { logger } from "./logger.js";
import { EventEmitter } from "events";

// Task types
export const TaskType = {
  INDEX_FOLDER: "index_folder",
  INDEX_FILES: "index_files",  // For file watcher
  RETRY_FAILED: "retry_failed"
};

// Task priorities (lower number = higher priority)
export const TaskPriority = {
  HIGH: 0,    // Manual retries
  MEDIUM: 1,  // File watcher
  LOW: 2      // API requests
};

// Task status
export const TaskStatus = {
  PENDING: "pending",
  ACTIVE: "active",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled"
};

export class TaskQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxConcurrentTasks = options.maxConcurrentTasks || 2;  // Max concurrent indexing operations
    this.maxFileWorkers = options.maxFileWorkers || 16;         // Workers per task
    this.maxRetries = options.maxRetries || 3;                   // Auto-retry attempts
    this.retryDelay = options.retryDelay || 1000;                // Initial retry delay (ms)

    this.tasks = new Map();  // taskId -> Task
    this.queue = [];         // Array of taskIds sorted by priority
    this.activeTasks = new Map();  // taskId -> Task (currently running)
    this.taskCounter = 0;
  }

  /**
   * Add a task to the queue
   * @param {string} type - Task type from TaskType
   * @param {object} data - Task data (folderPath, projectName, etc.)
   * @param {number} priority - Task priority from TaskPriority
   * @returns {string} Task ID
   */
  addTask(type, data, priority = TaskPriority.LOW) {
    const taskId = `task_${Date.now()}_${this.taskCounter++}`;
    const task = {
      id: taskId,
      type,
      data,
      priority,
      status: TaskStatus.PENDING,
      createdAt: Date.now(),
      retryCount: 0,
      progress: {
        totalFiles: 0,
        processedFiles: 0,
        failedFiles: 0,
        currentFile: null
      },
      failedPaths: []  // Track failed files per task
    };

    this.tasks.set(taskId, task);
    this.queue.push(taskId);
    this._sortQueue();

    logger.info(`[TaskQueue] Task added: ${taskId} (${type}) [priority: ${priority}]`);
    this.emit("task-added", task);

    // Try to process the queue asynchronously
    setImmediate(() => {
      this._processQueue().catch(err => {
        logger.error(`[TaskQueue] Queue processing error:`, err);
      });
    });

    return taskId;
  }

  /**
   * Get a task by ID
   * @param {string} taskId - Task ID
   * @returns {object|null} Task object or null
   */
  getTask(taskId) {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   * @returns {Array} Array of all tasks
   */
  getAllTasks() {
    return Array.from(this.tasks.values());
  }

  /**
   * Get active tasks
   * @returns {Array} Array of active tasks
   */
  getActiveTasks() {
    return Array.from(this.activeTasks.values());
  }

  /**
   * Cancel a task
   * @param {string} taskId - Task ID
   * @returns {boolean} True if cancelled successfully
   */
  cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.warn(`[TaskQueue] Cannot cancel - task not found: ${taskId}`);
      return false;
    }

    if (task.status === TaskStatus.PENDING) {
      // Remove from queue
      this.queue = this.queue.filter(id => id !== taskId);
      task.status = TaskStatus.CANCELLED;
      task.cancelledAt = Date.now();
      logger.info(`[TaskQueue] Task cancelled (pending): ${taskId}`);
      this.emit("task-cancelled", task);
      return true;
    } else if (task.status === TaskStatus.ACTIVE) {
      // Mark for cancellation (worker will check)
      task.cancelRequested = true;
      logger.info(`[TaskQueue] Cancellation requested for active task: ${taskId}`);
      this.emit("task-cancellation-requested", task);
      return true;
    }

    logger.warn(`[TaskQueue] Cannot cancel task in status: ${task.status}`);
    return false;
  }

  /**
   * Process the queue (private)
   * Starts tasks until we reach max concurrent tasks
   */
  async _processQueue() {
    // Start tasks until we reach max concurrent tasks
    while (this.queue.length > 0 && this.activeTasks.size < this.maxConcurrentTasks) {
      const taskId = this.queue.shift();
      const task = this.tasks.get(taskId);

      if (!task || task.status !== TaskStatus.PENDING) continue;

      this.activeTasks.set(taskId, task);
      task.status = TaskStatus.ACTIVE;
      task.startedAt = Date.now();

      logger.info(`[TaskQueue] Starting task: ${task.id}`);
      this.emit("task-started", task);

      // Process task in background (don't await)
      this._processTask(task).catch(err => {
        logger.error(`[TaskQueue] Task processing error: ${taskId}`, err);
      });
    }
  }

  /**
   * Process a single task (private)
   * @param {object} task - Task object
   */
  async _processTask(task) {
    const { handleIndexFolder } = await import("./core.js");

    try {
      logger.info(`[TaskQueue] Processing task: ${task.id} (${task.type})`);

      // Call the appropriate handler
      if (task.type === TaskType.INDEX_FOLDER || task.type === TaskType.INDEX_FILES) {
        await handleIndexFolder(
          task.data.folderPath,
          task.data.projectName,
          task.data.collection,
          task.data.summarize,
          false, // background - wait for completion since we are already in a worker
          task.data.force,
          task  // Pass task for progress updates
        );
      }

      // Check if cancelled
      if (task.cancelRequested) {
        task.status = TaskStatus.CANCELLED;
        task.cancelledAt = Date.now();
        logger.info(`[TaskQueue] Task cancelled after completion: ${task.id}`);
        this.emit("task-cancelled", task);
      } else {
        task.status = TaskStatus.COMPLETED;
        task.completedAt = Date.now();
        logger.info(`[TaskQueue] Task completed: ${task.id} (${task.progress.processedFiles}/${task.progress.totalFiles} files)`);
        this.emit("task-completed", task);
      }

    } catch (error) {
      logger.error(`[TaskQueue] Task failed: ${task.id}`, error);

      // Auto-retry logic
      if (task.retryCount < this.maxRetries) {
        task.retryCount++;
        task.status = TaskStatus.PENDING;
        task.lastError = error.message;
        const backoffDelay = this.retryDelay * Math.pow(2, task.retryCount - 1);
        task.nextRetryAt = Date.now() + backoffDelay;

        logger.info(`[TaskQueue] Scheduling retry ${task.retryCount}/${this.maxRetries} for ${task.id} in ${backoffDelay}ms`);
        logger.info(`[TaskQueue] Error was: ${error.message}`);

        // Schedule retry
        setTimeout(() => {
          this.queue.push(task.id);
          this._sortQueue();
          this._processQueue().catch(err => {
            logger.error(`[TaskQueue] Queue processing error during retry:`, err);
          });
        }, backoffDelay);

        this.emit("task-retry", task);
      } else {
        task.status = TaskStatus.FAILED;
        task.failedAt = Date.now();
        task.lastError = error.message;
        logger.error(`[TaskQueue] Task permanently failed after ${this.maxRetries} retries: ${task.id}`);
        this.emit("task-failed", task);
      }
    } finally {
      this.activeTasks.delete(task.id);

      // Process next task in queue
      this._processQueue().catch(err => {
        logger.error(`[TaskQueue] Queue processing error in finally:`, err);
      });
    }
  }

  /**
   * Sort queue by priority and creation time (private)
   */
  _sortQueue() {
    this.queue.sort((a, b) => {
      const taskA = this.tasks.get(a);
      const taskB = this.tasks.get(b);

      // Sort by priority (lower number = higher priority)
      if (taskA.priority !== taskB.priority) {
        return taskA.priority - taskB.priority;
      }

      // Then by creation time (older first)
      return taskA.createdAt - taskB.createdAt;
    });
  }

  /**
   * Get queue statistics
   * @returns {object} Queue statistics
   */
  getStats() {
    const tasks = Array.from(this.tasks.values()).map(task => ({
      id: task.id,
      type: task.type,
      status: task.status,
      priority: task.priority,
      progress: { ...task.progress },
      retryCount: task.retryCount,
      lastError: task.lastError,
      cancelRequested: !!task.cancelRequested,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt || task.cancelledAt || task.failedAt
    }));

    return {
      totalTasks: this.tasks.size,
      pendingTasks: this.queue.length,
      activeTasks: this.activeTasks.size,
      maxConcurrentTasks: this.maxConcurrentTasks,
      tasks
    };
  }
}

// Global singleton instance
let globalQueue = null;

/**
 * Get the global task queue instance
 * @returns {Promise<TaskQueue>} Task queue instance
 */
export async function getTaskQueue() {
  if (!globalQueue) {
    // Load config for settings
    const { loadConfig } = await import("./config.js");
    const config = await loadConfig();
    const queueConfig = config.queue || {};
    globalQueue = new TaskQueue({
      maxConcurrentTasks: queueConfig.maxConcurrentIndexingTasks || 2,
      maxFileWorkers: queueConfig.maxFileWorkers || 16,
      maxRetries: queueConfig.maxRetries || 3,
      retryDelay: queueConfig.retryDelay || 1000
    });
    logger.info("[TaskQueue] Initialized with config:", {
      maxConcurrentTasks: globalQueue.maxConcurrentTasks,
      maxFileWorkers: globalQueue.maxFileWorkers,
      maxRetries: globalQueue.maxRetries,
      retryDelay: globalQueue.retryDelay
    });
  }
  return globalQueue;
}
