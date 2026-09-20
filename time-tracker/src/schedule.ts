export type Phase = 'focus' | 'document' | 'break';

export interface Settings {
  /** Minute of the hour when documentation time starts (default 40). */
  documentMinute: number;
  /** Minute of the hour when the break starts (default 50). */
  breakMinute: number;
  /** First hour of the workday, 0-23 (default 8). */
  dayStart: number;
  /** Hour the workday ends, exclusive, 1-24 (default 17). */
  dayEnd: number;
  sound: boolean;
  /** Fire reminders outside dayStart–dayEnd too. */
  remindOffHours: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  documentMinute: 40,
  breakMinute: 50,
  dayStart: 8,
  dayEnd: 17,
  sound: true,
  remindOffHours: false,
};

const SETTINGS_KEY = 'work-rhythm:settings';
const LOG_PREFIX = 'work-rhythm:log:';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // ignore corrupt/unavailable storage
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // storage unavailable (private mode); settings just won't persist
  }
}

export function todayKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export type DayLog = Record<number, boolean>;

export function loadLog(dateKey: string): DayLog {
  try {
    const raw = localStorage.getItem(LOG_PREFIX + dateKey);
    if (raw) return JSON.parse(raw) as DayLog;
  } catch {
    // ignore
  }
  return {};
}

export function saveLog(dateKey: string, log: DayLog): void {
  try {
    localStorage.setItem(LOG_PREFIX + dateKey, JSON.stringify(log));
  } catch {
    // ignore
  }
}

export function phaseFor(minute: number, s: Settings): Phase {
  if (minute >= s.breakMinute) return 'break';
  if (minute >= s.documentMinute) return 'document';
  return 'focus';
}

export interface Boundary {
  /** Seconds from `now` until the next phase change. */
  secondsLeft: number;
  /** The phase that starts at that boundary. */
  nextPhase: Phase;
}

export function nextBoundary(now: Date, s: Settings): Boundary {
  const minute = now.getMinutes();
  const secondsIntoHour = minute * 60 + now.getSeconds();
  const boundaries: Array<{ minute: number; phase: Phase }> = [
    { minute: s.documentMinute, phase: 'document' },
    { minute: s.breakMinute, phase: 'break' },
    { minute: 60, phase: 'focus' },
  ];
  for (const b of boundaries) {
    const at = b.minute * 60;
    if (secondsIntoHour < at) {
      return { secondsLeft: at - secondsIntoHour, nextPhase: b.phase };
    }
  }
  return { secondsLeft: 3600 - secondsIntoHour, nextPhase: 'focus' };
}

export function isWorkHour(hour: number, s: Settings): boolean {
  return hour >= s.dayStart && hour < s.dayEnd;
}

export function formatHour(hour: number): string {
  const h = ((hour + 11) % 12) + 1;
  return `${h}${hour < 12 ? 'am' : 'pm'}`;
}

export function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
