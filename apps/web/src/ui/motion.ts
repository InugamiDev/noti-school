import { animate, stagger, type DOMKeyframesDefinition, type AnimationOptions } from 'motion';

// Same gate as the CSS: system reduced motion, the shared pause control and hidden pages all stop motion.
export function motionAllowed(element: Element | undefined) {
  if (!element || typeof matchMedia === 'undefined') return false;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return element.closest('[data-motion]')?.getAttribute('data-motion') !== 'off'
    && document.querySelector('.app-shell')?.getAttribute('data-motion') !== 'off';
}

/** Durations in seconds and the stagger step, mirroring the --dur-* / --stagger tokens in style.css. */
export const dur = { xs: 0.12, sm: 0.2, md: 0.32, lg: 0.42 } as const;
export const step = 0.045;

export const ease = {
  out: [0.16, 1, 0.3, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
  spring: [0.34, 1.4, 0.64, 1] as const,
};

/** Runs a short entrance only when motion is allowed; content is already in its final state otherwise. */
export function enter(
  target: Element | Element[] | NodeListOf<Element> | undefined,
  keyframes: DOMKeyframesDefinition,
  options: AnimationOptions & { gate?: Element } = {},
) {
  const list = !target ? [] : target instanceof Element ? [target] : [...target];
  if (!list.length || !motionAllowed(options.gate ?? list[0])) return undefined;
  const { gate: _gate, ...rest } = options;
  return animate(list, keyframes, { duration: dur.md, ease: ease.out, ...rest });
}

/** Draws the eye to something already on screen: a lift that settles back, never a layout change. */
export function pulse(target: Element | undefined, options: AnimationOptions = {}) {
  return enter(target, { scale: [1, 1.025, 1] }, { duration: dur.lg, ease: ease.inOut, ...options });
}

export { animate, stagger };
