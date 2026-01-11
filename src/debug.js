class DebugStore {
  constructor() {
    this.requests = [];
    this.maxRequests = 50;
  }

  logRequest(provider, model, payload, response = null, error = null) {
    const entry = {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toISOString(),
      provider,
      model,
      payload,
      response,
      error
    };

    this.requests.unshift(entry);
    if (this.requests.length > this.maxRequests) {
      this.requests.pop();
    }
    return entry.id;
  }

  updateResponse(id, response) {
    const entry = this.requests.find(r => r.id === id);
    if (entry) {
      entry.response = response;
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
