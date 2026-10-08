export function event() {
  const listeners = new Set();
  return {
    addListener: (fn) => listeners.add(fn),
    removeListener: (fn) => listeners.delete(fn),
    emit: (...args) => { for (const fn of [...listeners]) fn(...args); },
    get size() { return listeners.size; },
  };
}

// The Back promise resolves before the main-frame navigation, as in Firefox.
export function fakeBrowser(histories, { delay = 1, fail = false, stall = false } = {}) {
  const states = new Map(Object.entries(histories).map(([id, urls]) => [Number(id), {
    entries: urls.map((entry) => typeof entry === 'string' ? { url: entry } : entry),
    index: urls.length - 1,
    status: 'complete',
  }]));
  const webNavigation = Object.fromEntries([
    'onCommitted', 'onCompleted', 'onHistoryStateUpdated',
    'onReferenceFragmentUpdated', 'onErrorOccurred',
  ].map((name) => [name, event()]));
  const onRemoved = event();
  let pending = 0;
  let maxPending = 0;
  let requests = 0;
  const tabs = {
    onRemoved,
    async get(id) {
      const state = states.get(id);
      if (!state) throw new Error('Invalid tab ID');
      return { id, url: state.entries[state.index].url, status: state.status, active: true };
    },
    async goBack(id) {
      requests++;
      if (fail) throw new Error('Back unavailable');
      const state = states.get(id);
      if (!state) throw new Error('Invalid tab ID');
      if (stall || state.index === 0) return;
      pending++;
      maxPending = Math.max(maxPending, pending);
      setTimeout(() => {
        pending--;
        if (!states.has(id)) return;
        const entry = state.entries[--state.index];
        const details = {
          tabId: id, frameId: 0, url: entry.url,
          transitionType: 'link', transitionQualifiers: ['forward_back'],
        };
        if (entry.kind) {
          webNavigation[entry.kind].emit(details);
        } else {
          webNavigation.onCommitted.emit(details);
          webNavigation.onCompleted.emit(details);
        }
      }, delay);
    },
    async goForward(id) {
      const state = states.get(id);
      if (state.index < state.entries.length - 1) state.index++;
    },
  };
  return {
    tabs, webNavigation,
    close(id) { states.delete(id); onRemoved.emit(id, { isWindowClosing: false }); },
    get requests() { return requests; },
    get maxPending() { return maxPending; },
    setLoading(id) { states.get(id).status = 'loading'; },
    get temporaryListeners() {
      return Object.values(webNavigation).reduce((sum, e) => sum + e.size, 0);
    },
  };
}
