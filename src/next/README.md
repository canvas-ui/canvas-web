# /next — the content-centric shell (a2ui direction)

Experimental second UI mounted at `/next`, living beside the management UI.
Content-first: frosted-glass canvases over a wallpaper, one round toolbox
control (bottom right), voice-primary interaction, gestures/keyboard second.
Longer term the canvases render agent-declared widgets (a2ui.org protocol)
— "show me today's emails next to my todos" — rather than hand-built pages.

Rules of the house (enforced by eslint `no-restricted-imports`):

- This tree MAY import the data layer: `@/services`, `@/hooks`, `@/lib`,
  `@/types`, `@/config`, plus `@/components/renderers` and `@/components/ui`.
- It MUST NOT import the management UI's chrome (menu/shell/toolbox/pages…).
- Nothing outside `src/next/` imports from here except the lazy mount in
  `App.tsx`. Promotion or deletion of this UI is a one-route change.
