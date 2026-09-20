let audioCtx: AudioContext | null = null;

/**
 * iOS only allows audio started from a user gesture, so this must be called
 * from a tap handler (the "Enable alerts" button) before chime() can play.
 */
export function primeAudio(): void {
  if (!audioCtx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  audioCtx?.resume().catch(() => {});
}

export type ChimeKind = 'document' | 'break' | 'focus';

const CHIME_NOTES: Record<ChimeKind, number[]> = {
  document: [880, 1174.66], // A5 -> D6, "heads up"
  break: [659.25, 523.25, 659.25], // E5 C5 E5, "relax"
  focus: [523.25, 783.99], // C5 -> G5, "back to it"
};

export function chime(kind: ChimeKind): void {
  if (!audioCtx || audioCtx.state !== 'running') return;
  const now = audioCtx.currentTime;
  CHIME_NOTES[kind].forEach((freq, i) => {
    const osc = audioCtx!.createOscillator();
    const gain = audioCtx!.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = now + i * 0.22;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
    osc.connect(gain).connect(audioCtx!.destination);
    osc.start(start);
    osc.stop(start + 0.45);
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export async function notify(title: string, body: string): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg && 'showNotification' in reg) {
      await reg.showNotification(title, { body, icon: './icon-192.png' });
      return;
    }
  } catch {
    // fall through to the window-scoped API
  }
  try {
    new Notification(title, { body, icon: './icon-192.png' });
  } catch {
    // Notification constructor throws on some mobile browsers; nothing else to do.
  }
}

export function vibrate(pattern: number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // unsupported
  }
}
