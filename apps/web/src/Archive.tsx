import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';
export default function Archive(props: { paused: boolean; zoom: number }) {
  let host!: HTMLDivElement;
  let control: Awaited<ReturnType<(typeof import('./scene'))['mountArchive']>> | undefined;
  let disposed = false;
  const [fallback, setFallback] = createSignal(false);
  onMount(() => {
    void import('./scene')
      .then((module) => {
        if (disposed) return;
        control = module.mountArchive(host, () => setFallback(true));
        control.setPaused(props.paused);
      })
      .catch(() => setFallback(true));
  });
  createEffect(() => {
    const paused = props.paused;
    control?.setPaused(paused);
  });
  createEffect(() => {
    if (props.zoom) control?.zoom();
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
