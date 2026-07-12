/**
 * Tiny colour-utility shared by Agents, Workspaces and (soon) other pages.
 *
 * We intentionally keep the implementation vanilla-JS so it can be used from
 * both TSX components and plain JS helpers without transpiler complaints.
 */

// Return a random integer within min..max (inclusive)
const randomInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

// Produce an aesthetically pleasing random HSL triplet
const generateRandomHsl = (): { h: number; s: number; l: number } => ({
  h: randomInt(0, 360),
  s: randomInt(42, 98),
  l: randomInt(40, 90),
});

// Convert an HSL colour to a HEX string
const hslToHex = (h: number, s: number, l: number): string => {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;

  if (0 <= h && h < 60) {
    r = c;
    g = x;
  } else if (60 <= h && h < 120) {
    r = x;
    g = c;
  } else if (120 <= h && h < 180) {
    g = c;
    b = x;
  } else if (180 <= h && h < 240) {
    g = x;
    b = c;
  } else if (240 <= h && h < 300) {
    r = x;
    b = c;
  } else if (300 <= h && h < 360) {
    r = c;
    b = x;
  }

  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);

  const toHex = (val: number): string => val.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export const generateNiceRandomHexColor = (): string => {
  const { h, s, l } = generateRandomHsl();
  return hslToHex(h, s, l);
};

// WCAG relative luminance (0 = black, 1 = white) of a #rgb/#rrggbb hex color.
// Returns null for anything unparseable so callers can fall back gracefully.
export const relativeLuminance = (hex: string): number | null => {
  const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const channel = (i: number) => {
    const v = parseInt(h.slice(i * 2, i * 2 + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
};

// Whether a color is too light to be visible as an accent on our light
// background (the white-on-white case). Unparseable colors count as low
// contrast so callers pick the safe fallback.
export const isLowContrastOnLight = (color: string, threshold = 0.82): boolean => {
  const lum = relativeLuminance(color);
  return lum === null || lum > threshold;
};

// Accent color safe to render on our light background: returns the color
// itself, or undefined when it would be invisible (white-on-white) so callers
// fall back to their neutral styling.
export const visibleAccentColor = (color?: string | null): string | undefined =>
  color && !isLowContrastOnLight(color) ? color : undefined;

// Re-export helpers in case we want them elsewhere
export { randomInt, generateRandomHsl, hslToHex };
