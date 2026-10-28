import { createEffect, onCleanup, type JSX } from 'solid-js';

// intent: progressive motion without making content depend on browser animation support; status: implemented.
export function Band(props: {
  children: JSX.Element;
  motion: boolean;
  class?: string;
  id?: string;
  /** Id of the section heading, so the section is a named landmark region. */
  labelledby?: string;
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
                { opacity: 0.55, transform: 'translateY(14px)' },
                { opacity: 1, transform: 'translateY(0)' },
              ],
              { duration: 520, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
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
      aria-labelledby={props.labelledby}
      class={`site-band ${props.class || ''}`}
    >
      {props.children}
    </section>
  );
}
