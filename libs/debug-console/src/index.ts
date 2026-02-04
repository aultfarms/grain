export type LogLevel = 'info' | 'error' | 'log';

export type DebugLogEntry = {
  id: number;
  level: LogLevel;
  time: string;
  args: unknown[];
};

type Listener = (entry: DebugLogEntry) => void;

let logs: DebugLogEntry[] = [];
let nextId = 1;
let listeners: Listener[] = [];
let installed = false;
// Prevent re-entrant notification cycles when listeners themselves
// call console.info/console.error (which would otherwise recurse
// back into safePush and re-notify listeners).
let isNotifyingListeners = false;

// We capture the original console methods once, before patching, and
// we ONLY ever call these originals from inside this module to avoid
// recursion / infinite loops if our own code throws.
let originalInfo: ((...args: unknown[]) => void) | undefined;
let originalLog: ((...args: unknown[]) => void) | undefined;
let originalError: ((...args: unknown[]) => void) | undefined;

// Use globalThis so this works in both browser and Node without
// bringing in DOM lib types.
const globalScope: any =
  typeof globalThis !== 'undefined' ? globalThis : ({} as unknown);

function safeCallOriginalInfo(args: unknown[]): void {
  if (!originalInfo) return;
  try {
    originalInfo(...args);
  } catch {
    // Swallow; do not attempt to re-log failures.
  }
}

function safeCallOriginalError(message: string, error?: unknown): void {
  if (!originalError) return;
  try {
    if (error !== undefined) {
      originalError(message, error);
    } else {
      originalError(message);
    }
  } catch {
    // Swallow; do not attempt to log within error handling.
  }
}

function safeCallOriginalLog(args: unknown[]): void {
  if (!originalLog) return;
  try {
    originalLog(...args);
  } catch {
    // Swallow; do not attempt to re-log failures.
  }
}

// Internal helper for debug logging about the debug-console itself. This
// ONLY ever calls the original console.info (if present) to avoid
// interacting with our patched console methods.
function debugInfo(...args: unknown[]): void {
  // Prefix all messages so they are easy to spot.
  safeCallOriginalInfo(['[debug-console]', ...args]);
}

function safePush(level: LogLevel, args: unknown[]): void {
  try {
    const entry: DebugLogEntry = {
      id: nextId++,
      level,
      time: new Date().toISOString(),
      args,
    };

    debugInfo('safePush: new entry', {
      id: entry.id,
      level: entry.level,
      argsCount: entry.args.length,
      listenerCount: listeners.length,
    });

    // Replace array immutably to make it easy to consume from state
    // libraries that rely on identity changes.
    logs = [...logs, entry];

    // Notify listeners one-by-one; isolate failures so that a single
    // bad listener does not break logging. Guard against re-entrancy
    // so that listeners are not called recursively if they themselves
    // call console.info/console.error.
    if (isNotifyingListeners) {
      debugInfo('safePush: re-entrant call suppressed for entry', {
        id: entry.id,
        level: entry.level,
      });
      return;
    }

    isNotifyingListeners = true;
    try {
      for (const listener of listeners.slice()) {
        try {
          listener(entry);
        } catch (listenerError) {
          safeCallOriginalError(
            '[debug-console] listener error',
            listenerError,
          );
        }
      }
    } finally {
      isNotifyingListeners = false;
    }
  } catch (e) {
    // If our own logging code fails, report it ONLY via the original
    // console.error to avoid re-entering the patched console methods.
    safeCallOriginalError('[debug-console] internal error', e);
  }
}

export function getDebugLogs(): DebugLogEntry[] {
  return logs;
}

export function clearDebugLogs(): void {
  logs = [];
}

// Allow apps to register a listener (e.g., an action) that mirrors
// log entries into app-level state. Returns an unsubscribe function.
export function onDebugLog(listener: Listener): () => void {
  listeners.push(listener);
  debugInfo('onDebugLog: listener registered; count =', listeners.length);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
    debugInfo('onDebugLog: listener unregistered; count =', listeners.length);
  };
}

export function installDebugConsole(): void {
  if (installed) {
    debugInfo('installDebugConsole called but already installed; skipping');
    return;
  }
  installed = true;
  debugInfo('installDebugConsole: installing');

  // Capture originals BEFORE patching.
  try {
    originalInfo = typeof console.info === 'function'
      ? console.info.bind(console)
      : undefined;
  } catch {
    originalInfo = undefined;
  }

  try {
    originalLog = typeof console.log === 'function'
      ? console.log.bind(console)
      : undefined;
  } catch {
    originalLog = undefined;
  }

  try {
    originalError = typeof console.error === 'function'
      ? console.error.bind(console)
      : undefined;
  } catch {
    originalError = undefined;
  }

  debugInfo('installDebugConsole: captured originals', {
    hasInfo: !!originalInfo,
    hasLog: !!originalLog,
    hasError: !!originalError,
  });

  // Patch console.info
  try {
    console.info = (...args: unknown[]) => {
      // First, try to push into our log buffer and listeners.
      safePush('info', args);
      // Then, always forward to the original console.info so normal
      // logging behavior is preserved.
      safeCallOriginalInfo(args);
    };
    debugInfo('installDebugConsole: console.info patched');
  } catch (e) {
    safeCallOriginalError('[debug-console] failed to patch console.info', e);
  }

  // Patch console.log
  try {
    console.log = (...args: unknown[]) => {
      safePush('log', args);
      safeCallOriginalLog(args);
    };
    debugInfo('installDebugConsole: console.log patched');
  } catch (e) {
    safeCallOriginalError('[debug-console] failed to patch console.log', e);
  }

  // Patch console.error
  try {
    console.error = (...args: unknown[]) => {
      // As with info, push into our logs first.
      safePush('error', args);
      // Then, always forward to the original console.error. We call the
      // captured original directly so any failures here cannot
      // recurse into our patched method.
      if (originalError) {
        try {
          originalError(...args);
        } catch {
          // Swallow; do not attempt to log from here.
        }
      }
    };
    debugInfo('installDebugConsole: console.error patched');
  } catch (e) {
    safeCallOriginalError('[debug-console] failed to patch console.error', e);
  }

  // In browsers, also capture uncaught errors and unhandled promise
  // rejections and route them through the same logging path. We rely
  // only on feature detection, not DOM types, so this compiles in
  // Node as well.
  const addEventListener =
    globalScope && typeof globalScope.addEventListener === 'function'
      ? globalScope.addEventListener.bind(globalScope)
      : undefined;

  debugInfo('installDebugConsole: addEventListener available =', !!addEventListener);

  if (addEventListener) {
    try {
      const handleError = (event: any) => {
        try {
          const payload: unknown[] = [];
          if (event && typeof event.message === 'string') {
            payload.push(event.message);
          }
          if (event && 'error' in event && event.error != null) {
            payload.push(event.error);
          }
          if (payload.length === 0) {
            payload.push(event);
          }
          safePush('error', payload);
        } catch (e) {
          safeCallOriginalError(
            '[debug-console] window "error" handler failure',
            e,
          );
        }
      };

      const handleUnhandledRejection = (event: any) => {
        try {
          const reason = event && 'reason' in event ? event.reason : undefined;
          safePush('error', ['Unhandled promise rejection', reason]);
        } catch (e) {
          safeCallOriginalError(
            '[debug-console] "unhandledrejection" handler failure',
            e,
          );
        }
      };

      addEventListener('error', handleError);
      addEventListener('unhandledrejection', handleUnhandledRejection);
    } catch (e) {
      safeCallOriginalError(
        '[debug-console] failed to register global error handlers',
        e,
      );
    }
  }

  // Built-in smoke test: this should be captured by our patched
  // console.info and therefore appear in debugConsoleLogs in apps.
  console.info('[debug-console] installDebugConsole: test console.info after patch');
  console.log('[debug-console] installDebugConsole: test console.log after patch');
  console.error('[debug-console] installDebugConsole: test console.error after patch');
}

// Auto-install on first import in a browser environment so any other
// modules (like `debug`) see the patched console methods when they
// first bind their internal log functions.
if (typeof window !== 'undefined') {
  installDebugConsole();
}

// React helper: re-export the DebugConsole component from here so apps
// can `import { DebugConsole } from '@aultfarms/debug-console';`.
export { DebugConsole } from './DebugConsole.js';
