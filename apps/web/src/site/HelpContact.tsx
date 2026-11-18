import { createMemo, createSignal, For, Show } from 'solid-js';
import { Select } from '../ui/Select';
import { ArrowUpRight, Search, ArrowRight } from 'lucide-solid';
import { questions } from './Sections';
import type { Lang } from '../ui/format';

export function Help(props: { lang: Lang }) {
  const [query, setQuery] = createSignal('');
  const [category, setCategory] = createSignal('All');
  const results = createMemo(() => {
    const term = query().trim().toLocaleLowerCase();
    return questions(props.lang).filter(
      (item) =>
        (category() === 'All' || item.category === category()) &&
        `${item.question} ${item.answer}`.toLocaleLowerCase().includes(term),
    );
  });
  return (
    <div class="site-help">
      <div class="site-help-tools">
        <label for="help-search">Search help</label>
        <div class="site-search">
          <Search size={18} />
          <input
            id="help-search"
            type="search"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            placeholder="Try sources, Vietnamese or sign in"
          />
        </div>
        <div class="site-help-categories" role="group" aria-label="Help categories">
          <For each={['All', 'Answers', 'Sources', 'Accounts', 'Pilot']}>
            {(item) => (
              <button aria-pressed={category() === item} onClick={() => setCategory(item)}>
                {item}
              </button>
            )}
          </For>
        </div>
      </div>
      <p role="status" class="site-fine">
        {results().length} {results().length === 1 ? 'answer' : 'answers'} found
      </p>
      <div class="site-faq">
        <For each={results()}>
          {(item) => (
            <details lang={item.lang}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
              <a class="site-inline-link" href={item.href}>
                {item.action} <ArrowRight size={16} />
              </a>
            </details>
          )}
        </For>
      </div>
      <Show when={!results().length}>
        <div class="site-empty">
          <h2>No matching help articles.</h2>
          <p>Try a broader phrase or another category. You can also contact us.</p>
          <button
            onClick={() => {
              setQuery('');
              setCategory('All');
            }}
          >
            Clear filters
          </button>
          <a class="site-inline-link" href="#/contact">
            Contact us <ArrowRight size={16} />
          </a>
        </div>
      </Show>
    </div>
  );
}

export function Contact() {
  const [topic, setTopic] = createSignal('Pilot access');
  return (
    <div class="site-contact-grid">
      <div>
        <h2>Get in touch.</h2>
        <p>
          noti.school is built by InugamiDev. Reach out through the contact options on GitHub.
        </p>
        <a class="primary" href="https://github.com/InugamiDev">
          Open GitHub profile <ArrowUpRight size={18} />
        </a>
        <p class="site-fine">
          Please don’t post passwords or personal records in public.
        </p>
      </div>
      <div class="site-contact-prep">
        <Select
          id="contact-topic"
          label="What would you like to discuss?"
          value={topic()}
          onChange={setTopic}
          options={[
            'Pilot access',
            'Institutional documents',
            'Incorrect answer',
            'Account or privacy concern',
          ].map((value) => ({ value, label: value }))}
        />
        <div aria-live="polite" class="site-contact-guidance">
          <h3>Useful details to prepare</h3>
          <Show when={topic() === 'Pilot access'}>
            <p>
              Describe your role, what you want to learn from the pilot and whether you need student
              or institutional access.
            </p>
          </Show>
          <Show when={topic() === 'Institutional documents'}>
            <p>
              Describe the document types, who owns them and who can review updates. Start with
              public document titles, not private attachments.
            </p>
          </Show>
          <Show when={topic() === 'Incorrect answer'}>
            <p>
              Identify the question topic, questionable claim and source title or version. Leave out
              private conversation text and personal records.
            </p>
          </Show>
          <Show when={topic() === 'Account or privacy concern'}>
            <p>
              Ask for a suitable private contact method first. Never post passwords, session links,
              tokens or student records.
            </p>
          </Show>
        </div>
        <p class="site-fine">This selection stays on this page. Nothing is sent.</p>
      </div>
    </div>
  );
}
