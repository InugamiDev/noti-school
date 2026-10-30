// intent: the landing sections between the hero and the request form. Each section has its own arrangement so the page
//         reads as an argument, not a template: how (steps list + no-answer example), reads (document kinds + photo),
//         scope (rules + one example account), roles (tabs with a small real-UI preview).
// status: done
// next: the previews are illustrations of real UI states, never real account data; copy stays university-neutral.
// confidence: high
import { BookOpen, FileQuestion, FileText, Flag, Library, Lock, MessageSquare, RotateCcw } from 'lucide-solid';
import { For } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { LucideIcon } from 'lucide-solid';
import { Band } from '../site/Band';
import { Badge, Button, Tabs, type BadgeTone } from '../ui';
import styles from './Landing.module.scss';
import studyAvif1600 from '../assets/photos/study-desk-1600.avif';
import studyAvif800 from '../assets/photos/study-desk-800.avif';
import studyJpg1600 from '../assets/photos/study-desk-1600.jpg';
import studyJpg800 from '../assets/photos/study-desk-800.jpg';
import studyWebp1600 from '../assets/photos/study-desk-1600.webp';
import studyWebp800 from '../assets/photos/study-desk-800.webp';

interface SectionProps {
  motion: boolean;
}

function Heading(props: { id: string; title: string; lede?: string }) {
  return (
    <>
      <h2 id={props.id} class={styles.secTitle} tabIndex={-1}>
        {props.title}
      </h2>
      {props.lede && <p class={styles.secLede}>{props.lede}</p>}
    </>
  );
}

const steps = [
  ['Find the passages', "Your question is matched against your school's approved documents, in English or Vietnamese."],
  [
    'Write only what they support',
    'Each sentence of the answer must point to a passage. When no passage supports an answer, you get the limit and a next step instead.',
  ],
  ['Show you where', 'Every claim links to the document, edition, page and section, so you can read it yourself.'],
] as const;

export function HowSection(props: SectionProps & { onAskAgain: () => void }) {
  return (
    <Band motion={props.motion} id="how" labelledby="how-title">
      <div class={`site-wrap ${styles.how}`}>
        <div>
          <Heading id="how-title" title="How an answer gets made" />
          <ol class={styles.steps}>
            <For each={steps}>
              {([title, body], index) => (
                <li>
                  <span class={styles.stepNumber} aria-hidden="true">
                    {index() + 1}
                  </span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </li>
              )}
            </For>
          </ol>
        </div>
        <figure class={styles.howExample}>
          <article class={`${styles.card} ${styles.noAnswer}`} aria-label="Example of a no-answer result">
            <span class={styles.noAnswerIcon} aria-hidden="true">
              <FileQuestion size={20} />
            </span>
            <h3>No supported answer</h3>
            <p>Your school's approved sources don't cover dormitory pet rules.</p>
            <ol>
              <li>Search the source library for a related document.</li>
              <li>Rephrase with a course code or form name.</li>
              <li>Confirm with the responsible university office.</li>
            </ol>
            <div class={styles.actions}>
              <Button size="sm" href="#/sources">
                <Library aria-hidden="true" />
                Open sources
              </Button>
              <Button size="sm" variant="ghost" onClick={() => props.onAskAgain()}>
                <RotateCcw aria-hidden="true" />
                Ask again
              </Button>
            </div>
          </article>
          <figcaption>What you see when the documents don't say.</figcaption>
        </figure>
      </div>
    </Band>
  );
}

// Sample locators show the citation format, not real documents.
const kinds = [
  ['Handbooks and regulations', 'Dated editions stay labelled, so an older rule is never shown as current.', 'sample · 2025 ed. · p. 31 · sec. 4.2'],
  ['Forms and procedures', 'Steps for withdrawal, transcripts, leave of absence and appeals.', 'sample · form guide · step 3'],
  ['Course information', 'Prerequisites, credits and schedules where your school publishes them.', 'sample · catalogue · p. 112'],
  ['Either language', 'Ask in Vietnamese and read the answer in English, or the reverse. Quotes keep their original text.', 'sample · Quy chế đào tạo · Điều 12'],
] as const;

const PHOTO_PAGE =
  'https://commons.wikimedia.org/wiki/File:Cozy_study_space_with_an_open_book,_fresh_apple,_and_laptop_on_a_desk_in_bright_natural_light.jpg';
// Rendered width of the figure: the right grid column from lg (see .reads), otherwise the page width minus gutters.
const PHOTO_SIZES = '(min-width: 1200px) 452px, (min-width: 960px) calc(40vw - 28px), calc(100vw - 32px)';

export function ReadsSection(props: SectionProps) {
  return (
    <Band motion={props.motion} id="reads" labelledby="reads-title">
      <div class={`site-wrap ${styles.reads}`}>
        <div>
          <Heading
            id="reads-title"
            title="What it reads"
            lede="Only documents and official pages your university has reviewed and approved. Nothing from the open web or other schools."
          />
          <ul class={styles.kinds}>
            <For each={kinds}>
              {([title, body, locator]) => (
                <li>
                  <h3>{title}</h3>
                  <p>{body}</p>
                  <span class={styles.kindLocator} lang={/[ạđếờ]/.test(locator) ? 'vi' : undefined}>
                    {locator}
                  </span>
                </li>
              )}
            </For>
          </ul>
        </div>
        {/* Illustrative stock photo (CC BY 2.0, see assets/photos/CREDITS.md); not a partner university's documents. */}
        <figure class={styles.photo}>
          <picture>
            <source type="image/avif" srcset={`${studyAvif800} 800w, ${studyAvif1600} 1600w`} sizes={PHOTO_SIZES} />
            <source type="image/webp" srcset={`${studyWebp800} 800w, ${studyWebp1600} 1600w`} sizes={PHOTO_SIZES} />
            <img
              src={studyJpg800}
              srcset={`${studyJpg800} 800w, ${studyJpg1600} 1600w`}
              sizes={PHOTO_SIZES}
              width="1600"
              height="1068"
              loading="lazy"
              decoding="async"
              alt="An open, well-worn book on a stack of older books beside a laptop in daylight."
            />
          </picture>
          <figcaption>
            Illustrative photo, not a university document. Photo:{' '}
            <a href={PHOTO_PAGE} target="_blank" rel="noopener noreferrer">
              Shixart1985
            </a>
            ,{' '}
            <a href="https://creativecommons.org/licenses/by/2.0/" target="_blank" rel="noopener noreferrer">
              CC BY 2.0
            </a>
          </figcaption>
        </figure>
      </div>
    </Band>
  );
}

const rules = [
  ['One account, one school', 'Your invitation decides which university you ask about.'],
  ["Only that school's approved documents", 'An answer never mixes rules from another university.'],
  ["Schools can't see each other", 'Documents, questions and feedback stay inside each university.'],
] as const;

export function ScopeSection(props: SectionProps) {
  return (
    <Band motion={props.motion} id="scope" labelledby="scope-title">
      <div class={`site-wrap ${styles.split}`}>
        <div>
          <Heading
            id="scope-title"
            title="Every school gets its own sources"
            lede="noti.school works for any university, and each account belongs to one school. That keeps answers accurate and each school's documents private."
          />
          <ul class={styles.rules}>
            <For each={rules}>
              {([title, body]) => (
                <li>
                  <strong>{title}</strong>
                  <span>{body}</span>
                </li>
              )}
            </For>
          </ul>
        </div>
        <article class={`${styles.card} ${styles.account}`} aria-label="Example account scope">
          <div class={styles.accountHead}>
            <span class={styles.avatar} aria-hidden="true">
              LN
            </span>
            <div>
              <div class={styles.accountName}>Example student</div>
              <div class={styles.accountSub}>Signed in with an invitation</div>
            </div>
            <Badge>Example account</Badge>
          </div>
          <dl class={styles.accountRows}>
            <div>
              <dt>University</dt>
              <dd>Your school</dd>
            </div>
            <div>
              <dt>Sources you can ask about</dt>
              <dd>Your school's, approved only</dd>
            </div>
            <div>
              <dt>Answer language</dt>
              <dd lang="vi">English or Tiếng Việt</dd>
            </div>
            <div class={styles.locked}>
              <dt>Other universities</dt>
              <dd>
                <Lock size={14} aria-hidden="true" />
                Not searchable
              </dd>
            </div>
          </dl>
        </article>
      </div>
    </Band>
  );
}

type Feature = readonly [string, string];
type MiniRow = readonly [LucideIcon, string, string, BadgeTone];

function RolePanel(props: { features: readonly Feature[]; heading: string; rows: readonly MiniRow[] }) {
  return (
    <div class={styles.rolePanel}>
      <ul class={styles.features}>
        <For each={props.features}>
          {([title, body]) => (
            <li>
              <strong>{title}</strong>
              <span>{body}</span>
            </li>
          )}
        </For>
      </ul>
      <div class={styles.card}>
        <div class={styles.mini} role="group" aria-label={`Preview: ${props.heading}`}>
          <span class={styles.miniHeading}>{props.heading}</span>
          <For each={props.rows}>
            {([icon, label, badge, tone]) => (
              <div class={styles.miniRow}>
                <Dynamic component={icon} size={16} aria-hidden="true" />
                <span lang={/[ăâđêôơư]/i.test(label) ? 'vi' : undefined}>{label}</span>
                <Badge tone={tone} class={styles.miniBadge}>
                  {badge}
                </Badge>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

export function RolesSection(props: SectionProps) {
  return (
    <Band motion={props.motion} id="roles" labelledby="roles-title">
      <div class="site-wrap">
        <Heading
          id="roles-title"
          title="Built for everyone at a university"
          lede="The same cited answer serves the student who asked, the advisor who checks it and the team that keeps the documents current."
        />
        <Tabs
          aria-label="Roles"
          class={styles.roles}
          items={[
            {
              value: 'students',
              label: 'Students',
              content: (
                <RolePanel
                  features={[
                    ['Ask in your own words', 'English or Tiếng Việt, any time, without waiting for office hours.'],
                    ['Check before you act', 'Open the cited page before you submit a form or plan around a deadline.'],
                    ['Find past answers', 'Answers you open keep the sources they used.'],
                  ]}
                  heading="Your history"
                  rows={[
                    [MessageSquare, 'Course withdrawal deadline', '2 sources', 'sage'],
                    [MessageSquare, 'Đăng ký học phần', '1 source', 'sage'],
                    [MessageSquare, 'Dorm pet policy', 'No answer', 'neutral'],
                  ]}
                />
              ),
            },
            {
              value: 'staff',
              label: 'Advisors and staff',
              content: (
                <RolePanel
                  features={[
                    ['See exactly what a student saw', 'Answers carry their citations, so you can confirm the same page.'],
                    ['Spot outdated rules', 'Reports point to the claim and the passage, not a vague complaint.'],
                    ['Fewer repeat questions', 'Routine questions get answered from the handbook you already wrote.'],
                  ]}
                  heading="Reported answers"
                  rows={[
                    [Flag, 'Cites the 2023 edition', 'In review', 'clay'],
                    [Flag, 'Missing form link', 'Open', 'neutral'],
                  ]}
                />
              ),
            },
            {
              value: 'sources',
              label: 'Source teams',
              content: (
                <RolePanel
                  features={[
                    ['Upload and approve', 'Nothing becomes evidence until your team publishes it.'],
                    ['Keep editions straight', 'Superseded versions are labelled, never silently replaced.'],
                    ['See the gaps', 'Unanswered questions show which documents are missing.'],
                  ]}
                  heading="Your school's library"
                  rows={[
                    [BookOpen, 'Student Handbook, 2025', 'Approved', 'sage'],
                    [BookOpen, 'Student Handbook, 2023', 'Superseded', 'neutral'],
                    [FileText, 'Withdrawal form guide', 'In review', 'clay'],
                  ]}
                />
              ),
            },
          ]}
        />
      </div>
    </Band>
  );
}
