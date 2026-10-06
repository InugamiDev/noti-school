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
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !revealed) {
            revealed = true;
            animation = element.animate(
              [
                { opacity: 0.55, transform: 'translateY(12px)' },
                { opacity: 1, transform: 'translateY(0)' },
              ],
              { duration: 420, easing: 'ease-out' },
            );
          } else if (!entry.isIntersecting && animation) {
            animation.cancel();
          }
        }
      },
      { threshold: 0.06 },
    );
    observer.observe(element);
    onCleanup(() => {
      observer.disconnect();
      animation?.cancel();
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
