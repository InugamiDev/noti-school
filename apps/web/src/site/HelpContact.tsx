import { createMemo, createSignal, For, Match, Switch } from 'solid-js';
import { SearchX } from 'lucide-solid';
import { Accordion, Button, EmptyState, matchesQuery, SearchInput, Select } from '../ui';
import { faqCategories, questions, type FaqCategory } from './faq';

export function Help() {
  const [query, setQuery] = createSignal('');
  const [category, setCategory] = createSignal<FaqCategory | 'All'>('All');
  const results = createMemo(() =>
    questions.filter(
      (item) =>
        (category() === 'All' || item.category === category()) &&
        matchesQuery(query(), item.question, item.answer),
    ),
  );
  return (
    <div class="site-help">
      <div class="site-help-tools">
        <SearchInput
          class="site-help-search"
          label="Search help"
          placeholder="Try sources, Vietnamese or sign in"
          value={query()}
          onInput={setQuery}
        />
        <div class="site-chips" role="group" aria-label="Help categories">
          <For each={['All', ...faqCategories] as const}>
            {(item) => (
              <button type="button" aria-pressed={category() === item} onClick={() => setCategory(item)}>
                {item}
              </button>
            )}
          </For>
        </div>
      </div>
      <p role="status" class="site-meta">
        {results().length} {results().length === 1 ? 'answer' : 'answers'} found
      </p>
      <Accordion
        class="site-help-list"
        items={results().map((item) => ({
          value: item.id,
          title: item.question,
          content: (
            <>
              <p>{item.answer}</p>
              <a class="site-link" href={item.href}>
                {item.action}
              </a>
            </>
          ),
        }))}
      />
      {!results().length && (
        <EmptyState
          icon={SearchX}
          title="No matching help articles."
          body="Try a broader phrase or another category. You can also contact the project owner."
          action={
            <>
              <Button
                size="sm"
                onClick={() => {
                  setQuery('');
                  setCategory('All');
                }}
              >
                Clear filters
              </Button>
              <Button size="sm" variant="ghost" href="#/contact">
                Contact the owner
              </Button>
            </>
          }
        />
      )}
    </div>
  );
}

const topics = [
  'Access for your university',
  'Institutional documents',
  'Incorrect answer',
  'Account or privacy concern',
] as const;

export function Contact() {
  const [topic, setTopic] = createSignal<string>(topics[0]);
  return (
    <div class="site-contact-grid">
      <div class="site-card">
        <h2>Reach the project owner.</h2>
        <p>
          The public contact destination is InugamiDev’s GitHub profile. Use the contact options
          available there. There is no message submission form on this page.
        </p>
        <div class="site-actions">
          <Button variant="primary" href="https://github.com/InugamiDev">
            Open GitHub profile
          </Button>
        </div>
        <p class="site-meta">
          A response time is not guaranteed. Do not post sensitive information in public.
        </p>
      </div>
      <div class="site-card site-contact-prep">
        <Select
          label="What would you like to discuss?"
          options={topics.map((value) => ({ value, label: value }))}
          value={topic()}
          onChange={setTopic}
        />
        <div aria-live="polite" class="site-contact-guidance">
          <h3>Useful details to prepare</h3>
          <Switch>
            <Match when={topic() === 'Access for your university'}>
              <p>
                Name your university and describe your role, what you want students to find and who
                at your school could approve the documents.
              </p>
            </Match>
            <Match when={topic() === 'Institutional documents'}>
              <p>
                Describe the document types, who owns them and who can review updates. Start with
                public document titles, not private attachments.
              </p>
            </Match>
            <Match when={topic() === 'Incorrect answer'}>
              <p>
                Identify the question topic, questionable claim and source title or version. Leave out
                private conversation text and personal records.
              </p>
            </Match>
            <Match when={topic() === 'Account or privacy concern'}>
              <p>
                Ask for a suitable private contact method first. Never post passwords, session links,
                tokens or student records.
              </p>
            </Match>
          </Switch>
        </div>
        <p class="site-meta">This selection stays on this page. Nothing is sent.</p>
      </div>
    </div>
  );
}
