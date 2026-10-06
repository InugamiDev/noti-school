import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';
export default function Archive(props: { paused: boolean; zoom: number }) {
  let host!: HTMLDivElement;
  let bitmap!: HTMLImageElement;
  let fallbackZoom: (() => void) | undefined;
  let control: Awaited<ReturnType<(typeof import('./scene'))['mountArchive']>> | undefined;
  let disposed = false;
  // intent: only replay submits observed during this mount's import; status: implemented.
  let observedZoom = props.zoom;
  let pendingZoom = false;
  const [fallback, setFallback] = createSignal(false);
  onMount(() => {
    // Without visibility observation, keep the archive still and the page usable.
    if (typeof IntersectionObserver === 'undefined') {
      setFallback(true);
      return;
    }
    void import('./scene')
      .then((module) => {
        if (disposed) return;
        control = module.mountArchive(host, () => setFallback(true));
        control.setPaused(props.paused);
        if (pendingZoom && !fallback()) {
          control.zoom();
          pendingZoom = false;
        }
      })
      .catch(() => {
        if (!disposed) setFallback(true);
      });
  });
  // intent: animate only the visible fallback, without a JS frame loop; status: implemented.
  createEffect(() => {
    if (!fallback()) return;
    if (typeof IntersectionObserver === 'undefined' || !bitmap.animate) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    let animation: Animation | undefined;
    let stopped = false;
    const resting = 'translate(0, 0) scale(1.08)';
    const canPlay = () => !props.paused && !reduced.matches && !document.hidden && visible;
    const replace = (frames: Keyframe[], options: KeyframeAnimationOptions) => {
      if (animation) {
        animation.onfinish = null;
        animation.cancel();
      }
      animation = bitmap.animate(frames, options);
      if (!canPlay()) animation.pause();
    };
    const sync = () => {
      if (stopped) return;
      if (!canPlay()) {
        if (animation) {
          // Resolve the pending pause at this frame, including an offscreen observation.
          const time = animation.currentTime;
          animation.pause();
          if (time !== null) animation.currentTime = time;
        }
        return;
      }
      if (animation) {
        animation.play();
        return;
      }
      replace([{ transform: 'scale(1.04)' }, { transform: resting }], {
        duration: 2200,
        easing: 'ease-out',
        fill: 'forwards',
      });
      animation!.onfinish = () => {
        replace([{ transform: resting }, { transform: 'translate(-0.8%, 0.5%) scale(1.12)' }], {
          duration: 10000,
          direction: 'alternate',
          iterations: Infinity,
          easing: 'ease-in-out',
        });
      };
    };
    fallbackZoom = () => {
      if (!visible) {
        pendingZoom = true;
        return;
      }
      if (!canPlay()) return;
      const transform = getComputedStyle(bitmap).transform;
      replace([{ transform }, { transform: 'translate(-0.6%, 0.3%) scale(1.2)' }], {
        duration: 600,
        easing: 'ease-out',
        fill: 'forwards',
      });
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      sync();
      if (visible && pendingZoom) {
        pendingZoom = false;
        fallbackZoom?.();
      }
    });
    observer.observe(host.parentElement!);
    document.addEventListener('visibilitychange', sync);
    reduced.addEventListener('change', sync);
    createEffect(() => {
      props.paused;
      sync();
    });
    onCleanup(() => {
      stopped = true;
      fallbackZoom = undefined;
      if (animation) {
        animation.onfinish = null;
        animation.cancel();
      }
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
      reduced.removeEventListener('change', sync);
    });
  });
  createEffect(() => {
    const paused = props.paused;
    control?.setPaused(paused);
  });
  createEffect(() => {
    const zoom = props.zoom;
    if (zoom === observedZoom) return;
    observedZoom = zoom;
    if (fallbackZoom) fallbackZoom();
    else if (control) control.zoom();
    else pendingZoom = true;
  });
  onCleanup(() => {
    disposed = true;
    control?.dispose();
  });
  return (
    <div class="archive" classList={{ fallback: fallback() }} aria-hidden="true">
      <img ref={bitmap} src="/archive.webp" alt="" />
      <div class="scene" ref={host} />
      <div class="archive-shade" />
    </div>
  );
}
