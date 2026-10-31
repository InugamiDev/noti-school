import { createSignal } from 'solid-js';

// Design flag. Glass is the default; ?style=classic (search or hash query) or the footer switch
// goes back to the solid clay style. The choice is remembered in localStorage.
export type Style = 'classic' | 'glass';
const KEY = 'noti.style';
const styles: Style[] = ['classic', 'glass'];

const fromUrl = () => {
  const search = new URLSearchParams(location.search).get('style');
  const hash = new URLSearchParams(location.hash.split('?')[1] ?? '').get('style');
  const value = search ?? hash;
  return styles.includes(value as Style) ? (value as Style) : undefined;
};
const stored = () => {
  try {
    const value = localStorage.getItem(KEY);
    return styles.includes(value as Style) ? (value as Style) : undefined;
  } catch {
    return undefined;
  }
};
const remember = (value: Style) => {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* Optional. */
  }
};

const initial = fromUrl();
if (initial) remember(initial);
const [style, setStyleSignal] = createSignal<Style>(initial ?? stored() ?? 'glass');
/** True where CSS scroll-driven animations frost the header without an IntersectionObserver. */
export const scrollTimeline = typeof CSS !== 'undefined' && CSS.supports('animation-timeline', 'scroll()');

export function applyStyle(value: Style) {
  document.documentElement.dataset.style = value;
  // SVG filters inside backdrop-filter are Chromium-only; others get blur without refraction.
  const refract =
    value === 'glass' &&
    typeof CSS !== 'undefined' &&
    CSS.supports('backdrop-filter', 'url(#glass-refract) blur(1px)') &&
    'chrome' in window;
  document.documentElement.dataset.refract = refract ? 'on' : 'off';
}
export function setStyle(value: Style) {
  remember(value);
  setStyleSignal(value);
  applyStyle(value);
}
export { style };
applyStyle(style());
