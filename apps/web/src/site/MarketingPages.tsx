import { For, Match, Switch, type JSX } from 'solid-js';
import { ArrowUpRight, BookOpen, Languages, ArrowRight } from 'lucide-solid';
import { Band } from './Band';
import { Closing, DocumentRows, Workflow } from './Sections';
import ProductExample from './ProductExample';
import { Contact, Help } from './HelpContact';
import type { SiteRoute } from './SiteShell';
import type { Lang } from '../ui/format';

const introductions = {
  '/product': [
    'Product',
    'Find the answer. Keep the evidence.',
    'A question should lead somewhere you can inspect. noti.school brings the answer and its source passage into the same conversation.',
  ],
  '/students': [
    'For students',
    'University life has enough open tabs.',
    'Ask a specific question, check the source and move forward with a clearer understanding of what to do next.',
  ],
  '/universities': [
    'For universities',
    'Reconnect with your students.',
    'Help students find the knowledge your institution already maintains, while keeping source ownership and review in human hands.',
  ],
  '/pricing': [
    'Pricing',
    'Start with a conversation, not a checkout.',
    'noti.school is in an invitation-only pilot. Public pricing has not been published yet.',
  ],
  '/about': [
    'About',
    'Information is useful when people can reach it.',
    'noti.school answers university questions and shows you exactly where each answer comes from.',
  ],
  '/help': [
    'Help',
    'Find your next step.',
    'Answers about asking questions, reading sources and managing your account.',
  ],
  '/contact': [
    'Contact',
    'Let’s make the question clearer.',
    'Ask about access, bring your institution’s documents or report a problem.',
  ],
  '/security': [
    'Security',
    'Trust needs boundaries.',
    'How noti.school controls access to accounts, documents and answers.',
  ],
  '/privacy': [
    'Privacy',
    'Know what you are sharing.',
    'How noti.school handles your questions, account and documents. This notice is a draft ahead of public release.',
  ],
  '/terms': [
    'Terms',
    'A guide to using the pilot responsibly.',
    'The rules for using noti.school during the pilot. These terms are a draft ahead of public release.',
  ],
  '/changelog': [
    'Changelog',
    'A clearer view of the current pilot.',
    'What noti.school can do today.',
  ],
} as const;

function TextSection(props: { title: string; children: JSX.Element }) {
  return (
    <section class="site-reading-section">
      <h2>{props.title}</h2>
      <div>{props.children}</div>
    </section>
  );
}

// intent: distinct product pages without replacing the application route controller; status: implemented.
export default function MarketingPages(props: { route: Exclude<SiteRoute, '/'>; motion: boolean; lang: Lang }) {
  const intro = () => introductions[props.route];
  return (
    <article
      class={`site-content site-page site-page-${props.route.slice(1)}`}
      data-site-page={props.route.slice(1)}
    >
      <div class="site-page-heading">
        <span class="site-label">{intro()[0]}</span>
        <h1 tabIndex={-1}>{intro()[1]}</h1>
        <p>{intro()[2]}</p>
      </div>
      <Switch>
        <Match when={props.route === '/product'}>
          <Band motion={props.motion} class="site-product-example">
            <ProductExample />
          </Band>
          <Band motion={props.motion} class="site-reading">
            <TextSection title="From question to context">
              <p>
                Choose your institution and ask in English or Vietnamese. An answer can point to the
                relevant document passage instead of leaving you to search a whole collection.
              </p>
              <p>
                Open the citation to see the original version and page or section. Read the
                surrounding context before relying on a short answer.
              </p>
            </TextSection>
            <TextSection title="A useful limit is part of the answer">
              <p>
                A missing passage, an old version or conflicting instructions should change the
                response. If the evidence cannot support the question, the useful next step may be a
                source to read or an office to ask.
              </p>
            </TextSection>
            <TextSection title="Keep the conversation grounded">
              <p>
                Follow-up questions retain the selected institution. History helps you return to
                prior conversations, and answer feedback lets you identify a specific claim that
                needs review.
              </p>
              <a class="site-inline-link" href="#/">
                Ask your own question <ArrowRight size={17} />
              </a>
            </TextSection>
          </Band>
          <Band motion={props.motion}>
            <div class="site-section-heading">
              <h2>
                One collection.
                <br />
                Several ways in.
              </h2>
              <p>
                Documents in the collection are reviewed before they are shown as approved, and you
                see the ones your account can access. Pages found on the web are labelled as web
                pages.
              </p>
            </div>
            <DocumentRows />
          </Band>
        </Match>
        <Match when={props.route === '/students'}>
          <Band motion={props.motion} class="site-student-guide">
            <div>
              <Languages size={28} />
              <h2>
                Ask in the language
                <br />
                you think in.
              </h2>
              <p>
                Choose English or Tiếng Việt in the composer. Include the course, procedure or
                document you mean. A focused question is easier to check against a source.
              </p>
              <a class="primary" href="#/">
                Ask a question <ArrowRight size={17} />
              </a>
            </div>
            <div class="site-question-notes">
              <span class="site-label">Questions to start with</span>
              <p>“Where can I find the student handbook?”</p>
              <p>“Which document explains this procedure?”</p>
              <p lang="vi">“Tôi có thể tìm quy chế học vụ ở đâu?”</p>
            </div>
          </Band>
          <Band motion={props.motion} class="site-reading">
            <TextSection title="Before you act on an answer">
              <ol>
                <li>Check that the institution matches your question.</li>
                <li>Open the cited passage and read its context.</li>
                <li>
                  See whether it comes from an approved document or a web page, and how sure the
                  answer is.
                </li>
                <li>Check the document version and any effective date.</li>
                <li>
                  Confirm important deadlines or individual decisions with the responsible office.
                </li>
              </ol>
            </TextSection>
            <TextSection title="If the source is missing">
              <p>
                Try the source library. Your account may not have access, the document may need
                review, or the question may be outside the collection. An unsupported answer is not
                a substitute for an official decision.
              </p>
              <a class="site-inline-link" href="#/sources">
                Browse available documents <ArrowRight size={17} />
              </a>
            </TextSection>
            <TextSection title="Keep personal records out of the question">
              <p>
                Ask about the general procedure. Do not include student IDs, grades, health details,
                passwords or private correspondence. The pilot is not a channel for processing
                personal student cases.
              </p>
              <a class="site-inline-link" href="#/privacy">
                Read the pilot privacy notice <ArrowRight size={17} />
              </a>
            </TextSection>
          </Band>
        </Match>
        <Match when={props.route === '/universities'}>
          <Band motion={props.motion}>
            <div class="site-section-heading">
              <h2>
                Your documents.
                <br />A deliberate path to answers.
              </h2>
              <p>
                Bring a defined collection and a human approval owner. Start with a useful,
                reviewable slice of university information.
              </p>
            </div>
            <Workflow />
          </Band>
          <Band motion={props.motion} class="site-reading">
            <TextSection title="Define a pilot worth learning from">
              <p>
                Agree on the students and questions to serve, which documents can be used and how an
                outdated source will be corrected. Choose a small set of questions in English and
                Vietnamese to evaluate against the originals.
              </p>
            </TextSection>
            <TextSection title="Keep approval separate from upload">
              <p>
                Proposing a URL or uploading a file does not make it an approved source. Review the
                extracted text, document version and source status before publication. Restricted
                material requires an explicit access decision.
              </p>
            </TextSection>
            <TextSection title="Learn from what students cannot find">
              <p>
                Feedback can identify confusing explanations and gaps in a collection. Use those
                reports to improve the source material, not to automate academic decisions.
              </p>
              <a class="site-inline-link" href="#/security">
                Review the security boundaries <ArrowRight size={17} />
              </a>
            </TextSection>
          </Band>
          <Band motion={props.motion} class="site-pilot-band">
            <h2>
              Bring a collection.
              <br />
              Start a conversation.
            </h2>
            <p>
              Tell us which documents your students need and who reviews them. We will help you
              plan a pilot around them.
            </p>
            <a class="primary" href="#/contact">
              Discuss a pilot <ArrowRight size={18} />
            </a>
          </Band>
        </Match>
        <Match when={props.route === '/pricing'}>
          <Band motion={props.motion} class="site-access">
            <div>
              <span class="site-label">Current access model</span>
              <h2>
                A limited pilot,
                <br />
                with a defined scope.
              </h2>
              <p>
                During the pilot, students join through an invitation and institutions work with us
                directly on their collection.
              </p>
            </div>
            <dl>
              <div>
                <dt>Student access</dt>
                <dd>
                  By invitation. Sign in with your pilot account or Google.
                </dd>
              </div>
              <div>
                <dt>Institutional participation</dt>
                <dd>
                  Plan your document collection, reviewers and rollout with us.
                </dd>
              </div>
              <div>
                <dt>Public pricing</dt>
                <dd>Not published yet.</dd>
              </div>
            </dl>
          </Band>
          <Band motion={props.motion} class="site-audiences">
            <div>
              <h2>Already invited?</h2>
              <p>
                Sign in to pick up your questions and saved conversations.
              </p>
              <a class="site-inline-link" href="#/auth">
                Sign in to your account <ArrowRight size={18} />
              </a>
            </div>
            <div>
              <h2>Evaluating a pilot?</h2>
              <p>
                Tell us what your students need to find and who approves the sources.
              </p>
              <a class="primary" href="#/contact">
                Contact about access <ArrowRight size={18} />
              </a>
            </div>
          </Band>
        </Match>
        <Match when={props.route === '/about'}>
          <Band motion={props.motion} class="site-about-statement">
            <BookOpen size={30} />
            <h2>
              Less distance between
              <br />a question and its source.
            </h2>
            <p>
              University information is spread across handbooks, procedures and course documents.
              noti.school brings it into one place to ask, and every answer leads back to the
              original document.
            </p>
          </Band>
          <Band motion={props.motion} class="site-reading">
            <TextSection title="An independent project">
              <p>
                noti.school is built independently by InugamiDev. It is not affiliated with or
                endorsed by any university.
              </p>
              <a class="site-inline-link" href="https://github.com/InugamiDev">
                Visit the owner’s public profile <ArrowUpRight size={17} />
              </a>
            </TextSection>
            <TextSection title="A focused starting point">
              <p>
                The first pilot serves HCMIU students, with questions in English and Vietnamese.
              </p>
            </TextSection>
            <TextSection title="What we care about">
              <p>
                Students should find the right source quickly and see an answer’s limits. Document
                owners should be able to correct information without losing its version history.
              </p>
              <a class="site-inline-link" href="#/product">
                Explore the product <ArrowRight size={17} />
              </a>
            </TextSection>
          </Band>
        </Match>
        <Match when={props.route === '/help'}>
          <Band motion={props.motion} class="site-help-band">
            <Help lang={props.lang} />
          </Band>
        </Match>
        <Match when={props.route === '/contact'}>
          <Band motion={props.motion}>
            <Contact />
          </Band>
        </Match>
        <Match when={props.route === '/security'}>
          <Band motion={props.motion} class="site-reading">
            <TextSection title="Evidence has an owner and a version">
              <p>
                Answers use the selected institution’s reviewed documents first, within permitted
                visibility, then pages found on the web. Web pages are labelled, carry a confidence
                score and are never shown as approved. Citations identify original document versions
                and passage locations. Source text is treated as material to read, not instructions
                that can change account permissions.
              </p>
            </TextSection>
            <TextSection title="Access does not come from an answer">
              <p>
                Account membership determines access to protected collections and administration.
                Opening a citation must still respect source permissions. Being able to sign in with
                a university email is not, by itself, administrator authorization.
              </p>
            </TextSection>
            <TextSection title="Unavailable should mean unavailable">
              <p>
                Required evidence checks and answer services must be available before a live answer
                can be produced. Missing configuration or provider failures should leave a visible
                unavailable state. An attractive answer is not a reason to bypass those limits.
              </p>
            </TextSection>
            <TextSection title="Report a concern carefully">
              <p>
                Contact the owner to arrange an appropriate private channel. Do not post
                credentials, private documents or exploitable account details in public.
              </p>
              <a class="site-inline-link" href="#/contact">
                Contact about a concern <ArrowRight size={17} />
              </a>
            </TextSection>
          </Band>
        </Match>
        <Match when={props.route === '/privacy'}>
          <Band motion={props.motion} class="site-reading">
            <p class="site-draft-notice">Draft pilot notice · subject to release review</p>
            <TextSection title="Information used by the pilot">
              <p>
                Account details and institution membership support sign-in and access. Questions,
                conversation history and feedback support the answer experience. Source documents
                and extracted passages support retrieval and citations.
              </p>
              <p>
                Question drafts and selected preferences can be kept in this browser tab’s session
                storage. Avoid using a shared browser for sensitive information.
              </p>
            </TextSection>
            <TextSection title="External processing">
              <p>
                When live answers are enabled, OpenAI processes material for embeddings and answer
                generation, and TypeSafe AI’s Jev checks evidence. Questions and relevant source
                passages may be sent to these external services as part of that work.
              </p>
              <p>
                Provider-specific retention and processing terms, as well as the pilot’s final
                retention settings, require confirmation before public release. Do not assume the
                entire answer process stays on a local machine.
              </p>
            </TextSection>
            <TextSection title="What not to include">
              <p>
                Do not enter passwords, student IDs, grades, health records or private
                correspondence. Ask about general rules and procedures. This pilot is not intended
                to handle personal student records.
              </p>
            </TextSection>
            <TextSection title="Account controls and requests">
              <p>
                The account interface includes deletion controls when the required services are
                available. Deletion may involve confirmation and can fail if a dependency is
                unavailable; an unavailable response is not confirmation of deletion.
              </p>
              <p>
                Questions about access, correction or retention can be raised with the owner. Ask
                for a private channel before sharing identifying details. This draft does not
                promise a retention period or deletion deadline.
              </p>
              <a class="site-inline-link" href="#/contact">
                Contact about privacy <ArrowRight size={17} />
              </a>
            </TextSection>
            <TextSection title="This website’s example">
              <p>
                The interactive example uses fictional text stored with the website.
                Selecting a sample question does not send it to an answer service. The marketing
                pages add no external analytics or advertising scripts.
              </p>
            </TextSection>
          </Band>
        </Match>
        <Match when={props.route === '/terms'}>
          <Band motion={props.motion} class="site-reading">
            <p class="site-draft-notice">Draft pilot material · pending public-release review</p>
            <TextSection title="Purpose and status">
              <p>
                noti.school is an independent university information assistant in development. Pilot
                access is limited and invitation-bound. These notes describe intended use; they are
                not presented as a finalized legal agreement.
              </p>
            </TextSection>
            <TextSection title="Confirm important decisions">
              <p>
                Answers are informational and may be incomplete, outdated or unsupported. Inspect
                the original document and its version. Confirm deadlines, eligibility and individual
                academic decisions with the responsible university office.
              </p>
              <p>
                No official university affiliation or authority to make academic decisions is
                claimed.
              </p>
            </TextSection>
            <TextSection title="Use sources responsibly">
              <p>
                Only contribute material you are authorized to share. Respect document access
                restrictions and the rights of source owners. An uploaded document requires review
                before it is shown as an approved source.
              </p>
            </TextSection>
            <TextSection title="Protect accounts and people">
              <p>
                Do not share credentials, attempt to access another person’s information or submit
                private student records. Report questionable answers with the relevant claim and
                source rather than unnecessary personal details.
              </p>
            </TextSection>
            <TextSection title="Availability and change">
              <p>
                Features and pilot access may change during development. No uninterrupted
                availability, answer accuracy or public price is promised here. If a service is
                unavailable, use the original source or contact the responsible office.
              </p>
              <a class="site-inline-link" href="#/contact">
                Ask about these pilot notes <ArrowRight size={17} />
              </a>
            </TextSection>
          </Band>
        </Match>
        <Match when={props.route === '/changelog'}>
          <Band motion={props.motion} class="site-changelog">
            <span class="site-label">In noti.school today</span>
            <For
              each={[
                [
                  'Question and evidence workspace',
                  'Direct questions, cited passages, source versions and feedback are part of the application. Unavailable and unsupported answers have explicit states.',
                ],
                [
                  'Accounts and collections',
                  'Invitation-based accounts with Google sign-in, saved conversations, document review and collection administration.',
                ],
                [
                  'Product website and example',
                  'Guides for students and universities, searchable help, and an interactive example that shows an answer beside its source.',
                ],
                [
                  'Accessible archive motion',
                  'The 3D archive can be paused, follows your system’s reduced-motion setting and falls back to a still image when 3D is unavailable.',
                ],
              ]}
            >
              {([title, body]) => (
                <section>
                  <h2>{title}</h2>
                  <p>{body}</p>
                </section>
              )}
            </For>
            <div class="site-changelog-pending">
              <h2>Try it with your own question</h2>
              <p>Ask in English or Vietnamese and open the source behind the answer.</p>
              <a class="site-inline-link" href="#/">
                Ask a question <ArrowRight size={17} />
              </a>
            </div>
          </Band>
        </Match>
      </Switch>
      <Closing motion={props.motion} />
    </article>
  );
}
