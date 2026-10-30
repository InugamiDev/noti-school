// intent: the static landing sections between the hero and the request form, copy as in design/clay/reference/index.html.
// status: done
// next: the mini previews are illustrations of real UI states, never real account data.
// confidence: high
import {
  Bookmark,
  BookOpen,
  BookOpenCheck,
  Building2,
  ChartNoAxesColumn,
  Check,
  Clock,
  FileQuestion,
  FileSearch,
  FileText,
  Flag,
  History,
  Languages,
  Layers,
  Library,
  Lock,
  MessageSquare,
  PenLine,
  RotateCcw,
  School,
  Search,
  ShieldCheck,
  Upload,
  UserRoundCheck,
} from 'lucide-solid';
import { For, type JSX } from 'solid-js';
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

function Heading(props: { id: string; title: string; lede?: string; light?: boolean }) {
  return (
    <>
      <h2 id={props.id} class={styles.secTitle} tabIndex={-1}>
        {props.title}
      </h2>
      {props.lede && <p class={styles.secLede}>{props.lede}</p>}
    </>
  );
}

const rules = [
  [UserRoundCheck, 'One account, one school', 'Your invitation decides which university you ask about.'],
  [ShieldCheck, "Only that school's approved documents", 'An answer never mixes rules from another university.'],
  [Lock, "Schools can't see each other", 'Documents, questions and feedback stay inside each university.'],
] as const;

export function ScopeSection(props: SectionProps) {
  return (
    <Band motion={props.motion} id="scope" labelledby="scope-title">
      <div class={`site-wrap ${styles.split}`}>
        <div>
          <Heading
            id="scope-title"
            title="Every school gets its own sources"
            lede="noti.school works for any university, but each account belongs to one school. That keeps answers accurate and each school's documents private."
          />
          <ul class={styles.rules}>
            <For each={rules}>
              {([icon, title, body]) => (
                <li>
                  <span class={styles.ruleIcon} aria-hidden="true">
                    <Dynamic component={icon} size={20} />
                  </span>
                  <div>
                    <strong>{title}</strong>
                    <span>{body}</span>
                  </div>
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
            <Badge tone="sage" dot>
              Invited
            </Badge>
          </div>
          <div class={styles.accountRow}>
            <School size={18} aria-hidden="true" />
            University<span>HCMIU</span>
          </div>
          <div class={styles.accountRow}>
            <Library size={18} aria-hidden="true" />
            Sources you can ask about<span>HCMIU, approved only</span>
          </div>
          <div class={styles.accountRow}>
            <Languages size={18} aria-hidden="true" />
            Answer language<span lang="vi">English or Tiếng Việt</span>
          </div>
          <div class={`${styles.accountRow} ${styles.locked}`}>
            <Building2 size={18} aria-hidden="true" />
            Other universities
            <span>
              <Lock size={14} aria-hidden="true" />
              Not searchable
            </span>
          </div>
        </article>
      </div>
    </Band>
  );
}

const steps = [
  [Search, 'Find the passages', "Your question is matched against your school's approved documents, in either language."],
  [PenLine, 'Write only what they support', 'The answer is limited to what those passages say. Claims without support are removed.'],
  [Bookmark, 'Show you where', 'Each claim links to the document, edition, page and section, so you can read it yourself.'],
] as const;

export function HowSection(props: SectionProps) {
  return (
    <Band motion={props.motion} id="how" labelledby="how-title">
      <div class="site-wrap">
        <Heading id="how-title" title="How an answer gets made" lede="Three steps, and you can check each one." />
        <ol class={styles.steps}>
          <For each={steps}>
            {([icon, title, body], index) => (
              <li class={`${styles.card} ${styles.step}`}>
                <span class={styles.stepNumber} aria-hidden="true">
                  0{index() + 1}
                </span>
                <span class={styles.stepIcon} aria-hidden="true">
                  <Dynamic component={icon} size={20} />
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            )}
          </For>
        </ol>
      </div>
    </Band>
  );
}

type Feature = readonly [LucideIcon, string, string];
type MiniRow = readonly [LucideIcon, string, string, BadgeTone];

function RolePanel(props: { features: readonly Feature[]; heading: string; rows: readonly MiniRow[] }) {
  return (
    <div class={styles.rolePanel}>
      <div class={styles.card}>
        <ul class={styles.features}>
          <For each={props.features}>
            {([icon, title, body]) => (
              <li>
                <Dynamic component={icon} size={18} aria-hidden="true" />
                <div>
                  <strong>{title}</strong>
                  <span>{body}</span>
                </div>
              </li>
            )}
          </For>
        </ul>
      </div>
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
          lede="Students ask. Staff check what students are told. Each school's source team decides what counts as evidence."
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
                    [MessageSquare, 'Ask in your own words', 'English or Tiếng Việt, any time, without waiting for office hours.'],
                    [BookOpenCheck, 'Check before you act', 'Open the cited page before you submit a form or miss a deadline.'],
                    [History, 'Find past answers', 'Your question history keeps the sources it used.'],
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
                    [FileSearch, 'See exactly what a student saw', 'Answers carry their citations, so you can confirm the same page.'],
                    [Flag, 'Spot outdated rules', 'Reports point to the claim and the passage, not a vague complaint.'],
                    [Clock, 'Fewer repeat questions', 'Routine questions get answered from the handbook you already wrote.'],
                  ]}
                  heading="Reported answers"
                  rows={[
                    [Flag, 'Cites the 2023 edition', 'Review', 'clay'],
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
                    [Upload, 'Upload and approve', 'Nothing becomes evidence until your team publishes it.'],
                    [Layers, 'Keep editions straight', 'Superseded versions are labelled, never silently replaced.'],
                    [ChartNoAxesColumn, 'See the gaps', 'Unanswered questions show which documents are missing.'],
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

export function HonestSection(props: SectionProps & { onAskAgain: () => void }) {
  return (
    <Band motion={props.motion} labelledby="honest-title">
      <div class={`site-wrap ${styles.honest}`}>
        <div>
          <Heading
            id="honest-title"
            title="If the documents don't say, it won't guess."
            lede="A missing answer is safer than a made-up rule. You get a clear limit and a next step instead."
          />
        </div>
        <article class={`${styles.card} ${styles.noAnswer}`} aria-label="Example of a no-answer result">
          <span class={styles.noAnswerIcon} aria-hidden="true">
            <FileQuestion size={20} />
          </span>
          <h3>No supported answer</h3>
          <p>Your school's approved sources don't cover dormitory pet rules.</p>
          <ul>
            <For
              each={[
                'Search the source library for a related document',
                'Rephrase with a course code or form name',
                'Confirm with the responsible university office',
              ]}
            >
              {step => (
                <li>
                  <Check size={16} aria-hidden="true" />
                  {step}
                </li>
              )}
            </For>
          </ul>
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
      </div>
    </Band>
  );
}

function BentoCard(props: { class?: string | undefined; title: string; body: string; children?: JSX.Element }) {
  return (
    <article class={`${styles.card} ${styles.bentoCard} ${props.class ?? ''}`}>
      <div>
        <h3>{props.title}</h3>
        <p>{props.body}</p>
      </div>
      {props.children}
    </article>
  );
}

export function ReadsSection(props: SectionProps) {
  return (
    <Band motion={props.motion} id="reads" labelledby="reads-title">
      <div class="site-wrap">
        <Heading
          id="reads-title"
          title="What it reads"
          lede="Only documents your university has reviewed and approved. Nothing from the open web, nothing from other schools."
        />
        <div class={styles.bento}>
          <BentoCard
            class={styles.bentoWide}
            title="Handbooks and regulations"
            body="Student handbooks, academic regulations and their dated editions. Older versions stay labelled."
          >
            {/* Illustrative stock photo (CC BY 2.0, see assets/photos/CREDITS.md); not a partner university's documents. */}
            <figure class={styles.photo}>
              <picture>
                <source type="image/avif" srcset={`${studyAvif800} 800w, ${studyAvif1600} 1600w`} sizes="(min-width: 1024px) 520px, 92vw" />
                <source type="image/webp" srcset={`${studyWebp800} 800w, ${studyWebp1600} 1600w`} sizes="(min-width: 1024px) 520px, 92vw" />
                <img
                  src={studyJpg800}
                  srcset={`${studyJpg800} 800w, ${studyJpg1600} 1600w`}
                  sizes="(min-width: 1024px) 520px, 92vw"
                  width="1600"
                  height="1068"
                  loading="lazy"
                  decoding="async"
                  alt="An open, well-worn book on a stack of older books beside a laptop in daylight."
                />
              </picture>
              <figcaption>
                Photo:{' '}
                <a href="https://commons.wikimedia.org/wiki/File:Cozy_study_space_with_an_open_book,_fresh_apple,_and_laptop_on_a_desk_in_bright_natural_light.jpg" target="_blank" rel="noopener noreferrer">
                  Shixart1985
                </a>
                ,{' '}
                <a href="https://creativecommons.org/licenses/by/2.0/" target="_blank" rel="noopener noreferrer">
                  CC BY 2.0
                </a>
              </figcaption>
            </figure>
          </BentoCard>
          <BentoCard class={styles.bentoNarrow} title="Forms and procedures" body="Steps for common requests.">
            <div class={styles.tags}>
              <For each={['Withdrawal', 'Transcript', 'Leave of absence', 'Appeal']}>{tag => <Badge>{tag}</Badge>}</For>
            </div>
          </BentoCard>
          <BentoCard class={styles.bentoHalf} title="Course information" body="Prerequisites, credits and schedules where published.">
            <dl class={styles.course}>
              <div>
                <dt>Calculus 1</dt>
                <dd>sample · 4 credits</dd>
              </div>
              <div>
                <dt>Physics 2</dt>
                <dd>sample · needs Physics 1</dd>
              </div>
            </dl>
          </BentoCard>
          <BentoCard
            class={styles.bentoHalf}
            title="Ask in either language"
            body="Ask in one language and read the answer in the other. Sources keep their original text."
          >
            <p class={styles.lang} aria-hidden="true">
              <span lang="vi">Tiếng Việt</span>
              <span>English</span>
            </p>
          </BentoCard>
        </div>
      </div>
    </Band>
  );
}
