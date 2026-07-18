import { createSignal, onCleanup } from "solid-js";

const SOUND_STORAGE_KEY = "order-alert-sound";
const HIGHLIGHT_DURATION_MS = 10_000;

/** Plays a short beep via a Web Audio oscillator. No-ops if unsupported. */
export function playAlertBeep() {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.2;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.15);
  } catch {
    // Web Audio unsupported or blocked — the visual alert still fires.
  }
}

export function loadSoundPreference(): boolean {
  return localStorage.getItem(SOUND_STORAGE_KEY) === "true";
}

export function saveSoundPreference(enabled: boolean) {
  localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
}

/**
 * Tracks a set of ids that stay "highlighted" for HIGHLIGHT_DURATION_MS
 * after being passed to `highlight()`, restarting the window for any id
 * highlighted again before it expires. Used to flash new-order and
 * new-call alerts on the order board.
 *
 * Must be called during a component's synchronous setup (it registers
 * onCleanup), not inside an async callback.
 */
export function createHighlightTracker() {
  const [highlightedIds, setHighlightedIds] = createSignal<Set<string>>(
    new Set(),
  );
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function highlight(ids: Set<string>) {
    if (ids.size === 0) return;
    setHighlightedIds((prev) => new Set([...prev, ...ids]));
    for (const id of ids) {
      // A second alert on the same id before its highlight expires
      // restarts the window instead of letting the old timer clear
      // the newer highlight early.
      const existing = timers.get(id);
      if (existing) clearTimeout(existing);
      timers.set(
        id,
        setTimeout(() => {
          setHighlightedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          timers.delete(id);
        }, HIGHLIGHT_DURATION_MS),
      );
    }
  }

  onCleanup(() => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  });

  return { highlightedIds, highlight };
}

/** Formats the time elapsed since `createdAt` (Unix ms) as "N分前"/"N秒前". */
export function formatElapsed(createdAt: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - createdAt) / 1000));
  if (seconds < 60) return `${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}分前`;
}
