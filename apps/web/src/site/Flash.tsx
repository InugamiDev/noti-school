import { createEffect, createSignal, For, onCleanup } from 'solid-js';
import { BookOpen, FileText, Library, SearchX } from 'lucide-solid';
import { motionAllowed } from '../ui/motion';
import './flash.css';

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Site-wide scroll effects: a reading progress bar, hero parallax, card spotlight and eased wheel scrolling.
 *  Nothing runs while motion is off, and every style it writes is removed again. */
export function ScrollFx(props: { motion: boolean; home: boolean }) {
  let bar!: HTMLDivElement;
  // Hero decoration only plays while the hero is on screen and the tab is showing.
  createEffect(() => {
    if (!props.motion || !props.home || typeof IntersectionObserver === 'undefined') return;
    const hero = document.querySelector<HTMLElement>('.site-home .hero');
    if (!hero) return;
    let onScreen = false;
    const apply = () => {
      hero.dataset.live = String(onScreen && !document.hidden);
    };
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = !!entry?.isIntersecting;
      apply();
    });
    observer.observe(hero);
    document.addEventListener('visibilitychange', apply);
    onCleanup(() => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', apply);
      delete hero.dataset.live;
    });
  });
  createEffect(() => {
    if (!props.motion) return;
    let frame = 0;
    const hero = () => document.querySelector<HTMLElement>('.site-home .hero:not(.leaving)');
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? clamp(scrollY / max) : 0})`;
      const h = hero();
      if (h) h.style.setProperty('--hero-p', clamp(scrollY / h.offsetHeight).toFixed(3));
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // Cards follow the pointer with a soft light and a slight tilt.
    const spot = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest?.<HTMLElement>('.fx-card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      const x = (event.clientX - r.left) / r.width,
        y = (event.clientY - r.top) / r.height;
      card.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
      card.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
      card.style.setProperty('--rx', `${((0.5 - y) * 5).toFixed(2)}deg`);
      card.style.setProperty('--ry', `${((x - 0.5) * 6).toFixed(2)}deg`);
    };
    // The hero light follows the pointer, and primary buttons lean towards it.
    const glow = (event: PointerEvent) => {
      const h = hero();
      if (h) {
        h.style.setProperty('--px', `${((event.clientX / innerWidth) * 100).toFixed(1)}%`);
        h.style.setProperty('--py', `${((event.clientY / h.offsetHeight) * 100).toFixed(1)}%`);
      }
      for (const magnet of document.querySelectorAll<HTMLElement>('.fx-magnet')) {
        const r = magnet.getBoundingClientRect();
        const dx = event.clientX - (r.left + r.width / 2),
          dy = event.clientY - (r.top + r.height / 2);
        const near = Math.hypot(dx, dy) < Math.max(r.width, 120);
        magnet.style.setProperty('--tx', near ? `${(dx * 0.22).toFixed(1)}px` : '0px');
        magnet.style.setProperty('--ty', near ? `${(dy * 0.3).toFixed(1)}px` : '0px');
      }
    };
    update();
    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', queue);
    addEventListener('pointermove', spot, { passive: true });
    addEventListener('pointermove', glow, { passive: true });
    const stopWheel = smoothWheel();
    onCleanup(() => {
      removeEventListener('scroll', queue);
      removeEventListener('resize', queue);
      removeEventListener('pointermove', spot);
      removeEventListener('pointermove', glow);
      for (const magnet of document.querySelectorAll<HTMLElement>('.fx-magnet')) {
        magnet.style.removeProperty('--tx');
        magnet.style.removeProperty('--ty');
      }
      cancelAnimationFrame(frame);
      stopWheel();
      bar.style.transform = '';
      hero()?.style.removeProperty('--hero-p');
    });
  });
  return <div class="scroll-progress" aria-hidden="true" ref={bar} />;
}

function scrollsItself(target: EventTarget | null) {
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    const overflow = getComputedStyle(el).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && el.scrollHeight > el.clientHeight) return true;
  }
  return false;
}

/** Eases mouse-wheel scrolling on the page itself. Keyboard, touch, scroll bars and inner scroll areas stay native. */
function smoothWheel() {
  if (!matchMedia('(pointer: fine)').matches) return () => {};
  let target = scrollY,
    current = scrollY,
    frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const step = () => {
    current += (target - current) * 0.16;
    if (Math.abs(target - current) < 0.5) current = target;
    scrollTo({ top: current, behavior: 'instant' });
    frame = current === target ? 0 : requestAnimationFrame(step);
  };
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.defaultPrevented || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    if (scrollsItself(event.target) || document.querySelector('[role="listbox"]')) return;
    event.preventDefault();
    if (!frame) target = current = scrollY;
    const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? innerHeight : 1;
    const max = document.documentElement.scrollHeight - innerHeight;
    target = Math.min(max, Math.max(0, target + event.deltaY * unit));
    if (!frame) frame = requestAnimationFrame(step);
  };
  addEventListener('wheel', wheel, { passive: false });
  addEventListener('keydown', stop);
  addEventListener('pointerdown', stop);
  addEventListener('hashchange', stop);
  return () => {
    stop();
    removeEventListener('wheel', wheel);
    removeEventListener('keydown', stop);
    removeEventListener('pointerdown', stop);
    removeEventListener('hashchange', stop);
  };
}

/** The landing entrance: letters of the wordmark drop in, then the promise.
 *  It is CSS-only (transform and opacity) and controls never move, so the composer is usable immediately. */
export function heroIntro(hero: HTMLElement) {
  requestAnimationFrame(() => {
    if (!hero.isConnected || !motionAllowed(hero)) return;
    hero.dataset.intro = 'true';
    setTimeout(() => delete hero.dataset.intro, 2600);
  });
}

/** Splits text into words for the entrance; screen readers still read one sentence. */
export function Words(props: { text: string; class?: string }) {
  return (
    <span class={props.class}>
      <For each={props.text.split(' ')}>
        {(word, i) => (
          <>
            <span class="word" style={{ '--i': i() }}>{word}</span>
            {i() < props.text.split(' ').length - 1 ? ' ' : ''}
          </>
        )}
      </For>
    </span>
  );
}

/** Decorative citation chips floating around the hero, showing what an answer is made of. */
export function HeroOrbit() {
  const chips = [
    { icon: BookOpen, text: 'Student handbook · page 14', tone: 'peach' },
    { icon: FileText, text: 'Section 3.2', tone: 'sky' },
    { icon: Library, text: 'Current edition', tone: 'sage' },
    { text: 'Tiếng Việt · English', tone: 'lilac' },
    { text: '1', tone: 'number' },
    { text: '2', tone: 'number' },
  ] as const;
  return (
    <div class="hero-orbit" aria-hidden="true">
      <For each={chips}>
        {(chip, i) => (
          <span data-tone={chip.tone} style={{ '--i': i() }}>
            {'icon' in chip ? <chip.icon size={15} /> : null}
            {chip.text}
          </span>
        )}
      </For>
    </div>
  );
}

const steps = [
  { title: 'Ask the way you speak', body: 'Type your question in English or Vietnamese. No keywords, no menus.' },
  { title: 'Only approved documents', body: 'noti.school searches reviewed, published sources for your institution, nothing else.' },
  { title: 'Every claim cited', body: 'Each sentence links to the page or section it came from, in the version that applies.' },
  { title: 'Honest about gaps', body: 'If the sources do not cover your question, you are told so and shown where to go next.' },
] as const;

/** A pinned walkthrough on wide screens: the stage changes as you scroll. Without motion it is a plain list. */
export function Story(props: { motion: boolean }) {
  let root!: HTMLElement;
  const [active, setActive] = createSignal(0);
  const [pinned, setPinned] = createSignal(false);
  createEffect(() => {
    if (!props.motion) {
      setPinned(false);
      return;
    }
    const wide = matchMedia('(min-width: 960px)');
    const apply = () => setPinned(wide.matches);
    apply();
    wide.addEventListener('change', apply);
    onCleanup(() => wide.removeEventListener('change', apply));
  });
  createEffect(() => {
    if (!pinned()) {
      root.style.removeProperty('--story-p');
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const r = root.getBoundingClientRect();
      const p = clamp(-r.top / Math.max(1, r.height - innerHeight));
      root.style.setProperty('--story-p', p.toFixed(3));
      setActive(Math.min(steps.length - 1, Math.floor(p * steps.length)));
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', queue);
    onCleanup(() => {
      removeEventListener('scroll', queue);
      removeEventListener('resize', queue);
      cancelAnimationFrame(frame);
    });
  });
  return (
    <section ref={root} class="site-story" data-pinned={pinned() ? 'true' : 'false'} aria-labelledby="story-heading">
      <div class="story-sticky">
        <div class="story-copy">
          <span class="site-label">How it works</span>
          <h2 id="story-heading">From question to source in four steps.</h2>
          <ol class="story-steps">
            <For each={steps}>
              {(step, i) => (
                <li aria-current={pinned() && active() === i() ? 'step' : undefined} data-done={pinned() && i() < active()}>
                  <span class="story-number" aria-hidden="true">0{i() + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </li>
              )}
            </For>
          </ol>
          <div class="story-progress" aria-hidden="true">
            <span />
          </div>
        </div>
        <div class="story-stage fx-card" aria-hidden="true" data-active={pinned() ? active() : 2}>
          <div class="sv" data-step="0">
            <div class="sv-composer">
              <span class="sv-typed">How do I register for a course?</span>
              <span class="sv-caret" />
            </div>
            <div class="sv-langs">
              <span>English</span>
              <span>Tiếng Việt</span>
            </div>
          </div>
          <div class="sv" data-step="1">
            <div class="sv-docs">
              <For each={['Student handbook', 'Course guide', 'Forms & procedures']}>
                {(title, i) => (
                  <div class="sv-doc" style={{ '--i': i() }}>
                    <strong>{title}</strong>
                    <i />
                    <i />
                    <i />
                    {i() === 0 ? <em>Approved</em> : null}
                  </div>
                )}
              </For>
              <div class="sv-beam" />
            </div>
          </div>
          <div class="sv" data-step="2">
            <div class="sv-passage">
              <strong>Example University handbook</strong>
              <i />
              <i class="mark" />
              <i />
              <i class="short" />
              <span class="sv-cite">
                <b>1</b> Current edition · page 14
              </span>
            </div>
          </div>
          <div class="sv" data-step="3">
            <div class="sv-abstain">
              <SearchX size={28} />
              <strong>Not enough evidence</strong>
              <span>No approved document covers this yet.</span>
              <span class="sv-next">Browse sources · Ask the responsible office</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const rows = [
  [
    'Where is the student handbook?',
    'Tôi đăng ký môn học như thế nào?',
    'Which form do I need to change my major?',
    'Mẫu đơn xin nghỉ học tạm thời ở đâu?',
    'What does this regulation mean for me?',
  ],
  [
    'Quy chế học vụ nói gì về cách tính điểm?',
    'Who approves a leave of absence?',
    'Làm thế nào để chuyển ngành?',
    'Where do I find the course syllabus?',
    'Ai duyệt đơn bảo lưu kết quả học tập?',
  ],
];

/** Two drifting rows of the kinds of questions students bring. Purely decorative. */
export function Marquee() {
  return (
    <div class="site-marquee" aria-hidden="true">
      <For each={rows}>
        {(row, r) => (
          <div class="marquee-row" data-reverse={r() === 1}>
            <div class="marquee-track">
              <For each={[...row, ...row]}>{(text) => <span>{text}</span>}</For>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

const statement =
  'Every answer shows its sources. Every source shows its version. And when nothing covers your question, noti.school says so.';

/** A large statement whose words light up as it scrolls through the screen. Fully lit without motion. */
export function Kinetic(props: { motion: boolean }) {
  let root!: HTMLElement;
  const words = statement.split(' ');
  const [lit, setLit] = createSignal(words.length);
  createEffect(() => {
    if (!props.motion) {
      setLit(words.length);
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const r = root.getBoundingClientRect();
      const p = clamp((innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.35));
      setLit(Math.round(p * words.length));
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', queue);
    onCleanup(() => {
      removeEventListener('scroll', queue);
      removeEventListener('resize', queue);
      cancelAnimationFrame(frame);
    });
  });
  return (
    <section ref={root} class="site-kinetic" aria-label="Our promise">
      <p>
        <For each={words}>
          {(word, i) => (
            <>
              <span class="kw" data-lit={i() < lit()} data-accent={/sources|version|says/.test(word)}>
                {word}
              </span>{' '}
            </>
          )}
        </For>
      </p>
    </section>
  );
}
