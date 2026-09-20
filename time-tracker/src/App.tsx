import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  DayLog,
  Phase,
  Settings,
  formatCountdown,
  formatHour,
  isWorkHour,
  loadLog,
  loadSettings,
  nextBoundary,
  phaseFor,
  saveLog,
  saveSettings,
  todayKey,
} from './schedule';
import { chime, notify, primeAudio, requestNotificationPermission, vibrate } from './notify';

const PHASE_INFO: Record<Phase, { label: string; hint: string; color: string }> = {
  focus: { label: 'Focus', hint: 'Deep work — documentation reminder at :40', color: '#7c83ff' },
  document: { label: 'Document', hint: 'Write down what you did this hour', color: '#fbbf24' },
  break: { label: 'Break', hint: 'Step away for 10 minutes — you earned it', color: '#34d399' },
};

const PHASE_ALERTS: Record<Phase, { title: string; body: string }> = {
  document: {
    title: '📝 Documentation time',
    body: 'Take 10 minutes to write down what you did this hour, then tick the box.',
  },
  break: { title: '☕ Break time', body: 'Step away from the screen for 10 minutes.' },
  focus: { title: '🎯 New hour — focus', body: 'Fresh hour. Deep work until :40.' },
};

interface WakeLockSentinel {
  release(): Promise<void>;
  addEventListener(type: 'release', cb: () => void): void;
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [now, setNow] = useState<Date>(() => new Date());
  const [dateKey, setDateKey] = useState<string>(() => todayKey());
  const [log, setLog] = useState<DayLog>(() => loadLog(todayKey()));
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [keepAwake, setKeepAwake] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const lastPhaseRef = useRef<Phase>(phaseFor(new Date().getMinutes(), settings));
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Clock tick. Wall-clock based, so it stays correct even if the tab was suspended.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 250);
    return () => clearInterval(id);
  }, []);

  // Roll the log over at midnight.
  useEffect(() => {
    const key = todayKey(now);
    if (key !== dateKey) {
      setDateKey(key);
      setLog(loadLog(key));
    }
  }, [now, dateKey]);

  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => saveLog(dateKey, log), [dateKey, log]);

  const minute = now.getMinutes();
  const hour = now.getHours();
  const phase = phaseFor(minute, settings);
  const boundary = nextBoundary(now, settings);
  const inWorkHours = isWorkHour(hour, settings);

  // Fire alerts on phase transitions.
  useEffect(() => {
    if (phase === lastPhaseRef.current) return;
    lastPhaseRef.current = phase;
    const shouldRemind = inWorkHours || settings.remindOffHours;
    if (!alertsEnabled || !shouldRemind) return;
    const alert = PHASE_ALERTS[phase];
    void notify(alert.title, alert.body);
    if (settings.sound) chime(phase);
    vibrate(phase === 'break' ? [200, 100, 200] : [300]);
  }, [phase, alertsEnabled, inWorkHours, settings]);

  // Reflect state in the tab title so a pinned browser tab is useful too.
  useEffect(() => {
    document.title = `${formatCountdown(boundary.secondsLeft)} → ${PHASE_INFO[boundary.nextPhase].label} · Work Rhythm`;
  }, [boundary.secondsLeft, boundary.nextPhase]);

  async function enableAlerts() {
    primeAudio();
    const granted = await requestNotificationPermission();
    setAlertsEnabled(true);
    if (!granted && settings.sound) {
      // No notification permission; sound + vibration still work while the app is open.
    }
  }

  function testAlert() {
    primeAudio();
    void notify(PHASE_ALERTS.document.title, PHASE_ALERTS.document.body);
    if (settings.sound) chime('document');
    vibrate([300]);
  }

  async function toggleKeepAwake() {
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> };
    };
    if (keepAwake) {
      await wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
      setKeepAwake(false);
      return;
    }
    try {
      const sentinel = await nav.wakeLock?.request('screen');
      if (sentinel) {
        sentinel.addEventListener('release', () => setKeepAwake(false));
        wakeLockRef.current = sentinel;
        setKeepAwake(true);
      }
    } catch {
      setKeepAwake(false);
    }
  }

  // Re-acquire the wake lock when returning to the app (iOS releases it on background).
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && keepAwake && !wakeLockRef.current) {
        void toggleKeepAwake();
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keepAwake]);

  const info = PHASE_INFO[phase];
  const hourProgress = (minute * 60 + now.getSeconds()) / 3600;

  const workHours: number[] = [];
  for (let h = settings.dayStart; h < settings.dayEnd; h++) workHours.push(h);
  const documented = workHours.filter((h) => log[h]).length;
  const elapsedWorkHours = workHours.filter((h) => h < hour || (h === hour && phase !== 'focus')).length;

  function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  return (
    <div className="app" data-phase={phase}>
      <header>
        <h1>Work Rhythm</h1>
        <time>{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
      </header>

      <main>
        <ProgressRing progress={hourProgress} color={info.color} settings={settings}>
          <span className="phase-label" style={{ color: info.color }}>
            {info.label}
          </span>
          <span className="countdown">{formatCountdown(boundary.secondsLeft)}</span>
          <span className="next-up">until {PHASE_INFO[boundary.nextPhase].label}</span>
        </ProgressRing>

        <p className="hint">{info.hint}</p>
        {!inWorkHours && !settings.remindOffHours && (
          <p className="off-hours">
            Outside work hours ({formatHour(settings.dayStart)}–{formatHour(settings.dayEnd)}) — reminders muted
          </p>
        )}

        <div className="actions">
          {!alertsEnabled ? (
            <button className="primary" onClick={() => void enableAlerts()}>
              🔔 Enable alerts
            </button>
          ) : (
            <button onClick={testAlert}>Test alert</button>
          )}
          <button className={keepAwake ? 'active' : ''} onClick={() => void toggleKeepAwake()}>
            {keepAwake ? '📱 Screen stays on' : 'Keep screen on'}
          </button>
        </div>

        <section className="log">
          <div className="log-header">
            <h2>Today’s documentation</h2>
            <span className="log-count">
              {documented}/{elapsedWorkHours || workHours.length}
            </span>
          </div>
          <ul>
            {workHours.map((h) => {
              const isCurrent = h === hour && inWorkHours;
              return (
                <li key={h} className={isCurrent ? 'current' : ''}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!!log[h]}
                      onChange={(e) => setLog((l) => ({ ...l, [h]: e.target.checked }))}
                    />
                    <span className="hour-range">
                      {formatHour(h)} – {formatHour(h + 1)}
                    </span>
                    {isCurrent && <span className="badge">now</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="settings">
          <button className="settings-toggle" onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? '▾ Settings' : '▸ Settings'}
          </button>
          {showSettings && (
            <div className="settings-body">
              <label>
                Document at minute
                <input
                  type="number"
                  min={1}
                  max={58}
                  value={settings.documentMinute}
                  onChange={(e) =>
                    updateSetting(
                      'documentMinute',
                      Math.min(Math.max(1, Number(e.target.value) || DEFAULT_SETTINGS.documentMinute), settings.breakMinute - 1)
                    )
                  }
                />
              </label>
              <label>
                Break at minute
                <input
                  type="number"
                  min={2}
                  max={59}
                  value={settings.breakMinute}
                  onChange={(e) =>
                    updateSetting(
                      'breakMinute',
                      Math.min(Math.max(settings.documentMinute + 1, Number(e.target.value) || DEFAULT_SETTINGS.breakMinute), 59)
                    )
                  }
                />
              </label>
              <label>
                Workday starts
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={settings.dayStart}
                  onChange={(e) =>
                    updateSetting('dayStart', Math.min(Math.max(0, Number(e.target.value) || 0), settings.dayEnd - 1))
                  }
                />
              </label>
              <label>
                Workday ends
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={settings.dayEnd}
                  onChange={(e) =>
                    updateSetting('dayEnd', Math.min(Math.max(settings.dayStart + 1, Number(e.target.value) || 24), 24))
                  }
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={settings.sound}
                  onChange={(e) => updateSetting('sound', e.target.checked)}
                />
                Sound chime
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={settings.remindOffHours}
                  onChange={(e) => updateSetting('remindOffHours', e.target.checked)}
                />
                Remind outside work hours
              </label>
            </div>
          )}
        </section>
      </main>

      <footer>
        <p>
          On iPhone: open in Safari, tap <strong>Share → Add to Home Screen</strong>, then launch from the icon and
          enable alerts. Reminders fire while the app is open — use “Keep screen on” during work sessions for
          guaranteed alerts.
        </p>
      </footer>
    </div>
  );
}

function ProgressRing({
  progress,
  color,
  settings,
  children,
}: {
  progress: number;
  color: string;
  settings: Settings;
  children: React.ReactNode;
}) {
  const size = 280;
  const stroke = 14;
  const r = (size - stroke) / 2 - 8;
  const c = 2 * Math.PI * r;

  function markerAt(fraction: number) {
    const angle = fraction * 2 * Math.PI - Math.PI / 2;
    return {
      cx: size / 2 + r * Math.cos(angle),
      cy: size / 2 + r * Math.sin(angle),
    };
  }

  const docMark = markerAt(settings.documentMinute / 60);
  const breakMark = markerAt(settings.breakMinute / 60);

  return (
    <div className="ring-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Hour progress">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke 0.6s ease' }}
        />
        <circle {...docMark} r={5} fill={PHASE_INFO.document.color} />
        <circle {...breakMark} r={5} fill={PHASE_INFO.break.color} />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}
