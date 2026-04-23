export type StoreTheme = {
  primaryColor: string;
  primaryTextColor: string;
  primaryHoverColor: string;
  primarySoftColor: string;
  primaryBorderColor: string;
};

export const DEFAULT_PRIMARY_COLOR = '#059669';

export const DEFAULT_STORE_THEME: StoreTheme = {
  primaryColor: DEFAULT_PRIMARY_COLOR,
  primaryTextColor: '#ffffff',
  primaryHoverColor: '#047857',
  primarySoftColor: '#ecfdf5',
  primaryBorderColor: '#a7f3d0',
};

const HEX_COLOR_PATTERN = /^#?[0-9a-fA-F]{6}$/;

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeHex(input?: string | null) {
  if (!input || typeof input !== 'string') return DEFAULT_PRIMARY_COLOR;
  const value = input.trim();
  if (!HEX_COLOR_PATTERN.test(value)) return DEFAULT_PRIMARY_COLOR;
  return `#${value.replace('#', '').toUpperCase()}`;
}

function hexToRgb(hex: string) {
  const normalized = normalizeHex(hex).replace('#', '');
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((channel) => clampChannel(channel).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function mix(hex: string, target: string, weight: number) {
  const sourceRgb = hexToRgb(hex);
  const targetRgb = hexToRgb(target);
  return rgbToHex(
    sourceRgb.r * (1 - weight) + targetRgb.r * weight,
    sourceRgb.g * (1 - weight) + targetRgb.g * weight,
    sourceRgb.b * (1 - weight) + targetRgb.b * weight
  );
}

function getContrastText(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#111827' : '#ffffff';
}

export function createStoreTheme(theme?: Partial<StoreTheme> | null): StoreTheme {
  if (!theme || !isValidHexColor(theme.primaryColor)) {
    return { ...DEFAULT_STORE_THEME };
  }

  const primaryColor = normalizeHex(theme?.primaryColor);

  return {
    primaryColor,
    primaryTextColor: theme?.primaryTextColor && HEX_COLOR_PATTERN.test(theme.primaryTextColor)
      ? normalizeHex(theme.primaryTextColor)
      : getContrastText(primaryColor),
    primaryHoverColor: theme?.primaryHoverColor && HEX_COLOR_PATTERN.test(theme.primaryHoverColor)
      ? normalizeHex(theme.primaryHoverColor)
      : mix(primaryColor, '#000000', 0.16),
    primarySoftColor: theme?.primarySoftColor && HEX_COLOR_PATTERN.test(theme.primarySoftColor)
      ? normalizeHex(theme.primarySoftColor)
      : mix(primaryColor, '#FFFFFF', 0.9),
    primaryBorderColor: theme?.primaryBorderColor && HEX_COLOR_PATTERN.test(theme.primaryBorderColor)
      ? normalizeHex(theme.primaryBorderColor)
      : mix(primaryColor, '#FFFFFF', 0.64),
  };
}

export function isValidHexColor(input?: string | null) {
  return Boolean(input && HEX_COLOR_PATTERN.test(input.trim()));
}

export function applyStoreTheme(theme?: Partial<StoreTheme> | null) {
  if (typeof document === 'undefined') return createStoreTheme(theme);

  const resolvedTheme = createStoreTheme(theme);
  const root = document.documentElement;

  root.style.setProperty('--store-primary', resolvedTheme.primaryColor);
  root.style.setProperty('--store-primary-hover', resolvedTheme.primaryHoverColor);
  root.style.setProperty('--store-primary-soft', resolvedTheme.primarySoftColor);
  root.style.setProperty('--store-primary-border', resolvedTheme.primaryBorderColor);
  root.style.setProperty('--store-on-primary', resolvedTheme.primaryTextColor);

  return resolvedTheme;
}
