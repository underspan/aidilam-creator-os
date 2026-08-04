const REDACT_PATTERNS = /password|secret|token|api.?key|authorization|cookie/i;

function redactValue(key: string, value: unknown): unknown {
  if (typeof key === 'string' && REDACT_PATTERNS.test(key)) return '[REDACTED]';
  return value;
}

function sanitize(data?: Record<string, unknown>): Record<string, unknown> {
  if (!data) return {};
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    result[k] = redactValue(k, v);
  }
  return result;
}

export const logger = {
  info: (msg: string, data?: Record<string, unknown>) => {
    console.log(JSON.stringify({ level: 'info', msg, ts: new Date().toISOString(), ...sanitize(data) }));
  },
  warn: (msg: string, data?: Record<string, unknown>) => {
    console.warn(JSON.stringify({ level: 'warn', msg, ts: new Date().toISOString(), ...sanitize(data) }));
  },
  error: (msg: string, data?: Record<string, unknown>) => {
    console.error(JSON.stringify({ level: 'error', msg, ts: new Date().toISOString(), ...sanitize(data) }));
  },
  debug: (msg: string, data?: Record<string, unknown>) => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(JSON.stringify({ level: 'debug', msg, ts: new Date().toISOString(), ...sanitize(data) }));
    }
  },
};
