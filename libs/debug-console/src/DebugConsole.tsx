import * as React from 'react';
import type { DebugLogEntry } from './index.js';
import { getDebugLogs, clearDebugLogs, onDebugLog } from './index.js';

function shouldShowDebugConsole(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('debug') === '1';
}

function cssStringToStyle(style: string): React.CSSProperties {
  const result: React.CSSProperties = {};
  style
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const [prop, value] = part.split(':');
      if (!prop || !value) return;
      const camelProp = prop
        .trim()
        .replace(/-([a-z])/g, (_, c) => c.toUpperCase()) as keyof React.CSSProperties;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result as any)[camelProp] = value.trim();
    });
  return result;
}

function formatArgs(args: unknown[]): React.ReactNode {
  if (!args.length) return null;

  const [first, ...rest] = args;
  if (typeof first === 'string' && first.includes('%c')) {
    const template = first as string;
    const segments = template.split('%c');
    const elements: React.ReactNode[] = [];

    // Text before the first %c uses default styling
    if (segments[0]) {
      elements.push(<span key="seg-0">{segments[0]}</span>);
    }

    const styleCount = segments.length - 1;

    for (let i = 1; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg) continue;
      const styleArg = rest[i - 1];
      const style = typeof styleArg === 'string' ? cssStringToStyle(styleArg) : undefined;
      elements.push(
        <span key={`seg-${i}`} style={style}>
          {seg}
        </span>,
      );
    }

    // Any remaining args after the style arguments get appended
    const extraArgs = rest.slice(styleCount);
    if (extraArgs.length) {
      const extraText = extraArgs
        .map((arg) => {
          if (typeof arg === 'string') return arg;
          try {
            return JSON.stringify(arg);
          } catch {
            try {
              return String(arg);
            } catch {
              return '[unprintable]';
            }
          }
        })
        .join(' ');
      if (extraText) {
        elements.push(
          <span key="extra">
            {' '}
            {extraText}
          </span>,
        );
      }
    }

    return <>{elements}</>;
  }

  // Fallback for non-%c logs: stringify and join.
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        try {
          return String(arg);
        } catch {
          return '[unprintable]';
        }
      }
    })
    .join(' ');
}

export function DebugConsole(): React.ReactElement | null {
  const [enabled] = React.useState(shouldShowDebugConsole);
  const [logs, setLogs] = React.useState<DebugLogEntry[]>(() => getDebugLogs());

  React.useEffect(() => {
    if (!enabled) return;
    const unsubscribe = onDebugLog((entry) => {
      setLogs((prev: DebugLogEntry[]) => [...prev, entry]);
    });
    return () => {
      unsubscribe();
    };
  }, [enabled]);

  if (!enabled) return null;

  const handleClear = () => {
    clearDebugLogs();
    setLogs([]);
  };

  const handleTestMessage = () => {
    // This will be captured by the patched console and appear in the log list.
    console.info('[debug-console] Test message from DebugConsole component');
  };

  return (
    <div
      style={{
        marginTop: 16,
        width: '100%',
        maxHeight: '40vh',
        background: 'rgba(0,0,0,0.9)',
        color: '#fff',
        fontSize: 10,
        fontFamily: 'monospace',
        boxSizing: 'border-box',
        padding: '4px 6px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        <span>Debug console ({logs.length} entries)</span>
        <div>
          <button
            type="button"
            style={{
              fontSize: 10,
              padding: '2px 6px',
              cursor: 'pointer',
              marginRight: 4,
            }}
            onClick={handleTestMessage}
          >
            Test Message
          </button>
          <button
            type="button"
            style={{
              fontSize: 10,
              padding: '2px 6px',
              cursor: 'pointer',
            }}
            onClick={handleClear}
          >
            Clear
          </button>
        </div>
      </div>
      <div
        style={{
          overflowY: 'auto',
          maxHeight: '32vh',
        }}
      >
        {logs.map((log: DebugLogEntry) => (
          <div
            key={log.id}
            style={{
              marginBottom: 2,
              color: log.level === 'error' ? '#ff6b6b' : '#9be9a8',
            }}
          >
            <span>[{log.time}] </span>
            <span>{log.level.toUpperCase()}: </span>
            <span>{formatArgs(log.args)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
