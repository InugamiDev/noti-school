import { createMemo, createSignal, For, Show } from 'solid-js';
import { ArrowUpRight, Search } from 'lucide-solid';
import { questions } from './Sections';

export function Help() {
  const [query, setQuery] = createSignal('');
  const [category, setCategory] = createSignal('All');
  const results = createMemo(() => {
    const term = query().trim().toLocaleLowerCase();
    return questions.filter(
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
            <details>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
              <a class="site-inline-link" href={item.href}>
                {item.action} <ArrowUpRight size={16} />
              </a>
            </details>
          )}
        </For>
      </div>
      <Show when={!results().length}>
        <div class="site-empty">
          <h2>No matching help articles.</h2>
          <p>Try a broader phrase or another category. You can also contact the project owner.</p>
          <button
            onClick={() => {
              setQuery('');
              setCategory('All');
            }}
          >
            Clear filters
          </button>
          <a class="site-inline-link" href="#/contact">
            Contact the owner <ArrowUpRight size={16} />
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
        <h2>Reach the project owner.</h2>
        <p>
          The public contact destination is InugamiDev’s GitHub profile. Use the contact options
          available there. There is no message submission form on this page.
        </p>
        <a class="primary" href="https://github.com/InugamiDev">
          Open GitHub profile <ArrowUpRight size={18} />
        </a>
        <p class="site-fine">
          A response time is not guaranteed. Do not post sensitive information in public.
        </p>
      </div>
      <div class="site-contact-prep">
        <label for="contact-topic">What would you like to discuss?</label>
        <select
          id="contact-topic"
          value={topic()}
          onChange={(e) => setTopic(e.currentTarget.value)}
        >
          <option>Pilot access</option>
          <option>Institutional documents</option>
          <option>Incorrect answer</option>
          <option>Account or privacy concern</option>
        </select>
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
