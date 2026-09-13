/**
 * DEEPER — structured logger with levels + session id.
 * Iteration 1: replaces ad-hoc console.warn with leveled, filterable output.
 * Levels: debug < info < warn < error. Level persisted in localStorage.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export const SESSION_ID = (() => {
  try {
    const k = "deeper.session";
    let v = sessionStorage.getItem(k);
    if (!v) {
      v = Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(k, v);
    }
    return v;
  } catch {
    return "nosess";
  }
})();

class Logger {
  level: LogLevel = "info";
  private buffer: { t: number; level: LogLevel; scope: string; msg: string }[] = [];
  private cap = 200;

  constructor() {
    try {
      const v = localStorage.getItem("deeper.logLevel") as LogLevel | null;
      if (v && v in ORDER) this.level = v;
    } catch { /* defaults */ }
  }

  setLevel(l: LogLevel) {
    this.level = l;
    try { localStorage.setItem("deeper.logLevel", l); } catch { /* ignore */ }
  }

  private write(level: LogLevel, scope: string, msg: string, data?: unknown) {
    this.buffer.push({ t: Date.now(), level, scope, msg });
    if (this.buffer.length > this.cap) this.buffer.shift();
    if (ORDER[level] < ORDER[this.level]) return;
    const line = `[${SESSION_ID}][${scope}] ${msg}`;
    if (level === "error") console.error(line, data ?? "");
    else if (level === "warn") console.warn(line, data ?? "");
    else console.log(line, data ?? "");
  }

  debug(scope: string, msg: string, data?: unknown) { this.write("debug", scope, msg, data); }
  info(scope: string, msg: string, data?: unknown) { this.write("info", scope, msg, data); }
  warn(scope: string, msg: string, data?: unknown) { this.write("warn", scope, msg, data); }
  error(scope: string, msg: string, data?: unknown) { this.write("error", scope, msg, data); }
  recent(n = 40) { return this.buffer.slice(-n); }
}

export const log = new Logger();

/** Global error boundary: captures uncaught errors into the log buffer. */
export function installErrorBoundary() {
  window.addEventListener("error", (e) => {
    log.error("window", `uncaught: ${e.message}`, { file: e.filename, line: e.lineno });
  });
  window.addEventListener("unhandledrejection", (e) => {
    log.error("window", `unhandled rejection: ${String(e.reason)}`);
  });
}
