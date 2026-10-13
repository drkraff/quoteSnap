export type StartupMark = {
  name: string;
  ms: number;
  kind?: string;
};

const marks: StartupMark[] = [];
let origin: number | null = null;

function readEvalStart(): number | null {
  const stamped = (globalThis as { __QUOTESNAP_JS_EVAL_START_MS__?: unknown })
    .__QUOTESNAP_JS_EVAL_START_MS__;
  return typeof stamped === 'number' && Number.isFinite(stamped) ? stamped : null;
}

function originMs(now: number): number {
  if (origin == null) {
    origin = readEvalStart() ?? now;
  }
  return origin;
}

/**
 * One JSON line on the device log. Fields are a mark name and milliseconds
 * since JS eval started. No tokens, ids, or URLs.
 */
export function noteStartup(
  name: string,
  extra?: { kind?: string },
  now = Date.now(),
): number {
  const ms = Math.max(0, now - originMs(now));
  const mark: StartupMark = extra?.kind
    ? { name, ms, kind: extra.kind }
    : { name, ms };
  marks.push(mark);
  // The app entry stamps eval start. Unit tests that do not stamp stay quiet.
  if (readEvalStart() != null) {
    const line: { msg: 'startup_trace'; name: string; ms: number; kind?: string } = {
      msg: 'startup_trace',
      name,
      ms,
    };
    if (extra?.kind) line.kind = extra.kind;
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(line));
  }
  return ms;
}

export function startupTraceMarks(): readonly StartupMark[] {
  return marks.slice();
}

export function resetStartupTraceForTests(): void {
  marks.length = 0;
  origin = null;
}
