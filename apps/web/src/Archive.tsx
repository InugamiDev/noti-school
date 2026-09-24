import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';
export default function Archive(props: { paused: boolean; zoom: number }) {
  let host!: HTMLDivElement;
  let control: Awaited<ReturnType<(typeof import('./scene'))['mountArchive']>> | undefined;
  let disposed = false;
  // intent: only replay submits observed during this mount's import; status: implemented.
  let observedZoom = props.zoom;
  let pendingZoom = false;
  const [fallback, setFallback] = createSignal(false);
  onMount(() => {
    void import('./scene')
      .then((module) => {
        if (disposed) return;
        control = module.mountArchive(host, () => setFallback(true));
        control.setPaused(props.paused);
        if (pendingZoom) {
          control.zoom();
          pendingZoom = false;
        }
      })
      .catch(() => {
        if (!disposed) setFallback(true);
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
    if (control) control.zoom();
    else pendingZoom = true;
  });
  onCleanup(() => {
    disposed = true;
    control?.dispose();
  });
  return (
    <div class="archive" classList={{ fallback: fallback() }} aria-hidden="true">
      <img src="/archive.webp" alt="" />
      <div class="scene" ref={host} />
      <div class="archive-shade" />
    </div>
  );
}
