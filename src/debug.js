class DebugStore {
  constructor() {
    this.requests = [];
    this.maxRequests = 50;
  }

  logRequest(provider, model, payload, response = null, error = null) {
    // Deep clone and truncate large strings in payload to prevent UI lag
    const truncatedPayload = this._truncateValue(payload);

    const entry = {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toISOString(),
      provider,
      model,
      payload: truncatedPayload,
      response,
      error
    };

    this.requests.unshift(entry);
    if (this.requests.length > this.maxRequests) {
      this.requests.pop();
    }
    return entry.id;
  }

  _truncateValue(val, depth = 0) {
    if (depth > 5) return "[Max Depth]";
    if (typeof val === 'string') {
      return val.length > 5000 ? val.substring(0, 5000) + "... [truncated]" : val;
    }
    if (Array.isArray(val)) {
      return val.map(item => this._truncateValue(item, depth + 1));
    }
    if (typeof val === 'object' && val !== null) {
      const result = {};
      for (const key in val) {
        result[key] = this._truncateValue(val[key], depth + 1);
      }
      return result;
    }
    return val;
  }

  updateResponse(id, response) {
    const entry = this.requests.find(r => r.id === id);
    if (entry) {
      entry.response = this._truncateValue(response);
    }
  }

  updateError(id, error) {
    const entry = this.requests.find(r => r.id === id);
    if (entry) {
      entry.error = error;
    }
  }

  getRequests() {
    return this.requests;
  }

  clear() {
    this.requests = [];
  }
}

export const debugStore = new DebugStore();
