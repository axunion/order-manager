# New-Order Alerts on the Order Board

**Status:** ready for implementation — drafted 2026-07-11 (roadmap Phase 2, item 3)

Staff currently must watch the screen; polling refreshes silently. Add
sound + visual alerts when new orders or appended items arrive.

## Design — client-side only, no API change

The OrderBoard already polls `GET /api/admin/orders` every 5s. Detect
novelty by diffing: keep the max `order_items.created_at` seen so far as
a watermark (items, not orders — appended items to an existing order must
also alert). On each poll, any item newer than the watermark triggers the
alert and advances it. Initial load sets the watermark silently.

The `?since=` query param stays unused — full-list diffing is simpler and
the payload is small at this scale. (Remove-or-use is a Phase 5 realtime
concern.)

## Alert behavior

- **Sound:** short beep generated with a Web Audio oscillator (no audio
  asset, nothing to bundle). Browsers block audio before a user gesture,
  so sound is an explicit opt-in toggle in the OrderBoard header;
  persisted in `localStorage` (`order-alert-sound`). The first toggle-on
  click doubles as the unlocking gesture.
- **Visual (always on):** newly arrived order cards get a highlight style
  for ~10 seconds; `document.title` gains a `(N)` unserved-item count so
  a backgrounded tab still shows activity.

## Staff-call reuse (Phase 3)

The staff-call proposal reuses this exact mechanism (watermark diff +
beep + highlight); keep the beep and highlight helpers component-local
but factor them so `StaffCallBanner` can import them later (extract to a
shared module only when that second consumer lands, per the 3+ rule this
is still fine at 2 within the same app).

## Testing

- Component tests (happy-dom): watermark advances without alert on first
  load; new item triggers highlight; toggle persists to localStorage;
  title count reflects unserved items. Stub the Web Audio API
  (`vi.stubGlobal("AudioContext", …)`) — assert it is invoked, not that
  sound plays.
