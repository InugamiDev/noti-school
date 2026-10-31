import { createEffect, onCleanup, type JSX } from 'solid-js';

// intent: progressive motion without making content depend on browser animation support; status: implemented.
export function Band(props: {
  children: JSX.Element;
  motion: boolean;
  class?: string;
  id?: string;
}) {
  let element!: HTMLElement;
  let revealed = false;
  createEffect(() => {
    if (
      !props.motion ||
      revealed ||
      typeof IntersectionObserver === 'undefined' ||
      !element.animate
    )
      return;
    let animation: Animation | undefined;
    let children: Animation[] = [];
    const stop = () => {
      animation?.cancel();
      for (const child of children) child.cancel();
      children = [];
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !revealed) {
            revealed = true;
            element.dataset.revealed = 'true';
            animation = element.animate(
              [
                { opacity: 0.55, transform: 'translateY(12px)' },
                { opacity: 1, transform: 'translateY(0)' },
              ],
              { duration: 420, easing: 'ease-out' },
            );
            // Then each block rises out of a soft blur, one after another.
            children = [...element.children].map((child, i) =>
              child.animate(
                [
                  { opacity: 0, transform: 'translateY(32px)', filter: 'blur(8px)' },
                  { opacity: 1, transform: 'none', filter: 'blur(0px)' },
                ],
                { duration: 760, delay: 60 + i * 110, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' },
              ),
            );
          } else if (!entry.isIntersecting && animation) {
            stop();
          }
        }
      },
      { threshold: 0.06 },
    );
    observer.observe(element);
    onCleanup(() => {
      observer.disconnect();
      stop();
    });
  });
  return (
    <section
      ref={(node) => {
        element = node;
      }}
      id={props.id}
      class={`site-band ${props.class || ''}`}
    >
      {props.children}
    </section>
  );
}
