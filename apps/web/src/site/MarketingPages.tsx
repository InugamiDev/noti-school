import { For, Match, Switch, type JSX } from 'solid-js';
import BookOpen from 'lucide-solid/icons/book-open';
import Languages from 'lucide-solid/icons/languages';
import { Badge, Button } from '../ui';
import { Band } from './Band';
import { Closing, DocumentRows, Workflow } from './Sections';
import ProductExample from './ProductExample';
import { Contact, Help } from './HelpContact';
import type { SiteRoute } from './SiteShell';

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
    'Any university can join. Help students find the knowledge your school already maintains, while source ownership and review stay in your hands.',
  ],
  '/pricing': [
    'Pricing',
    'Start with a conversation, not a checkout.',
    'The current pilot is limited and invitation-bound, with HCMIU as the first school. Public prices and paid plans have not been set.',
  ],
  '/about': [
    'About',
    'Information is useful when people can reach it.',
    'noti.school is an independent project in development, exploring a more accountable way to answer university questions.',
  ],
  '/help': [
    'Help',
    'Find your next step.',
    'Practical answers about using the pilot, checking sources and recovering when something is unavailable.',
  ],
  '/contact': [
    'Contact',
    'Let’s make the question clearer.',
    'Discuss access for your university, institutional documents or a concern with the person building noti.school.',
  ],
  '/security': [
    'Security',
    'Trust needs boundaries.',
    'Source approval, account access and visible limitations are part of the product’s design. They are not a claim of certification or complete security.',
  ],
  '/privacy': [
    'Privacy',
    'Know what you are sharing.',
    'A readable draft notice for the pilot. This material needs review before public release and is not a finalized privacy policy.',
  ],
  '/terms': [
    'Terms',
    'A guide to using the pilot responsibly.',
    'Draft pilot terms for discussion and release review. This page is not presented as a reviewed public legal agreement.',
  ],
  '/changelog': [
    'Changelog',
    'A clearer view of the current pilot.',
    'An undated account of the product’s current scope. Included features and remaining evaluation are described separately.',
  ],
} as const;

function TextSection(props: { title: string; children: JSX.Element }) {
  return (
    <section class="site-card site-reading-section">
      <h2>{props.title}</h2>
      <div>{props.children}</div>
    </section>
  );
}

// intent: distinct product pages without replacing the application route controller; status: implemented.
export default function MarketingPages(props: { route: Exclude<SiteRoute, '/'>; motion: boolean }) {
  const intro = () => introductions[props.route];
  return (
    <article
      class={`site-page site-page-${props.route.slice(1)}`}
      data-site-page={props.route.slice(1)}
    >
      {/* No eyebrow pill: the document title and the nav highlight already name the page. */}
      <div class="site-wrap site-page-heading">
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
                Your account belongs to your school, and you ask in English or Vietnamese. An answer can
                point to the relevant passage in your school's approved documents instead of leaving
                you to search a whole collection.
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
              <p>
                The pilot’s live answer quality is still under evaluation. A working citation link
                alone does not prove that a claim is supported.
              </p>
            </TextSection>
            <TextSection title="Keep the conversation grounded">
              <p>
                Follow-up questions stay with your school. History helps you return to
                prior conversations, and answer feedback lets you identify a specific claim that
                needs review.
              </p>
              <a class="site-link" href="#/">
                Ask your own question
              </a>
            </TextSection>
          </Band>
          <Band motion={props.motion}>
            <div class="site-section-heading">
              <h2>
                One collection.
                Several ways in.
              </h2>
              <p>
                Document coverage depends on what has been approved and made available to your
                account.
              </p>
            </div>
            <DocumentRows />
          </Band>
        </Match>
        <Match when={props.route === '/students'}>
          <Band motion={props.motion} class="site-student-guide">
            <div>
              <span class="site-icon-tile" aria-hidden="true">
                <Languages size={22} />
              </span>
              <h2>
                Ask in the language
                you think in.
              </h2>
              <p>
                Choose English or Tiếng Việt in the question box. Include the course, procedure or
                document you mean. A focused question is easier to check against a source.
              </p>
              <Button variant="primary" href="#/">
                Ask a question
              </Button>
            </div>
            <div class="site-question-notes">
              <h3>Questions to start with</h3>
              <p>“Where can I find the student handbook?”</p>
              <p>“Which document explains this procedure?”</p>
              <p lang="vi">“Tôi có thể tìm quy chế học vụ ở đâu?”</p>
              <small>Question ideas, not statements about available coverage.</small>
            </div>
          </Band>
          <Band motion={props.motion} class="site-reading">
            <TextSection title="Before you act on an answer">
              <ol>
                <li>Check that the school shown is your own university.</li>
                <li>Open the cited passage and read its context.</li>
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
              <a class="site-link" href="#/sources">
                Browse available documents
              </a>
            </TextSection>
            <TextSection title="Keep personal records out of the question">
              <p>
                Ask about the general procedure. Do not include student IDs, grades, health details,
                passwords or private correspondence. The pilot is not a channel for processing
                personal student cases.
              </p>
              <a class="site-link" href="#/privacy">
                Read the pilot privacy notice
              </a>
            </TextSection>
          </Band>
        </Match>
        <Match when={props.route === '/universities'}>
          <Band motion={props.motion}>
            <div class="site-section-heading">
              <h2>
                Your documents.
                 A deliberate path to answers.
              </h2>
              <p>
                Each university brings its own collection and a human approval owner. Start with a
                useful, reviewable slice of your school's information.
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
                Proposing a URL or uploading a file does not make it answer evidence. Your school's
                source team reviews the
                extracted text, document version and source status before publication. Restricted
                material requires an explicit access decision.
              </p>
              <p>
                Administration is account- and membership-bound. Institutional interest does not
                automatically grant administrator access.
              </p>
            </TextSection>
            <TextSection title="Learn from what students cannot find">
              <p>
                Feedback can identify confusing explanations and gaps in a collection. Use those
                reports to improve the source material, not to automate academic decisions.
              </p>
              <a class="site-link" href="#/security">
                Review the security boundaries
              </a>
            </TextSection>
          </Band>
          <Band motion={props.motion} class="site-pilot-band">
            <h2>
              Bring a collection.
              Start a conversation.
            </h2>
            <p>
              No university partnership or deployment is implied by this website. Request your
              university, then contact the owner to discuss source permission, review
              responsibilities and access.
            </p>
            <div class="site-actions">
              <Button variant="primary" href="#/contact">
                Discuss a pilot
              </Button>
              <Button href="#join">Request your university</Button>
            </div>
          </Band>
        </Match>
        <Match when={props.route === '/pricing'}>
          <Band motion={props.motion} class="site-access">
            <div>
                            <h2>
                A limited pilot,
                with a defined scope.
              </h2>
              <p>
                There is no public checkout or published subscription. Access, source coverage and
                service availability need to be confirmed before you rely on the pilot.
              </p>
            </div>
            <dl>
              <div>
                <dt>Student access</dt>
                <dd>
                  By invitation. Existing participants can use their account when sign-in is
                  available.
                </dd>
              </div>
              <div>
                <dt>Institutional participation</dt>
                <dd>
                  Any university can request access. Discuss document scope, approval ownership and
                  evaluation with the project owner.
                </dd>
              </div>
              <div>
                <dt>Public pricing</dt>
                <dd>Not announced. No unlimited usage or future price is promised.</dd>
              </div>
            </dl>
          </Band>
          <Band motion={props.motion} class="site-audiences">
            <div>
              <h2>Already invited?</h2>
              <p>
                Use the account page to sign in. If a required service is unavailable, the page will
                explain what can be used.
              </p>
              <a class="site-link" href="#/auth">
                Sign in to your account
              </a>
            </div>
            <div>
              <h2>Evaluating a pilot?</h2>
              <p>
                Tell us what information you want students to find and who can approve the sources.
                Start with scope before discussing access.
              </p>
              <Button variant="primary" href="#/contact">
                Contact about access
              </Button>
            </div>
          </Band>
        </Match>
        <Match when={props.route === '/about'}>
          <Band motion={props.motion} class="site-about-statement">
            <span class="site-icon-tile" aria-hidden="true">
              <BookOpen size={22} />
            </span>
            <h2>
              Less distance between
               a question and its source.
            </h2>
            <p>
              University information is often spread across handbooks, procedures and course
              documents. The project explores whether a source-grounded assistant can make that
              information easier to use without hiding where it came from.
            </p>
          </Band>
          <Band motion={props.motion} class="site-reading">
            <TextSection title="An independent project">
              <p>
                noti.school is built by the project owner, InugamiDev. It is in development and
                claims no official university affiliation, partnership or endorsement.
              </p>
              <a class="site-link" href="https://github.com/InugamiDev">
                Visit the owner’s public profile
              </a>
            </TextSection>
            <TextSection title="A focused starting point">
              <p>
                noti.school is built for any university, one school per account. The first pilot is
                HCMIU, with English and Vietnamese questions. Approved source coverage, human
                evaluation and operational readiness still need to be established before other
                universities join.
              </p>
            </TextSection>
            <TextSection title="What we want to learn">
              <p>
                Can students find the right source more easily? Can they recognize an answer’s
                limits? Can a document owner correct information without losing its version history?
                These are questions for evaluation, not results claimed here.
              </p>
              <a class="site-link" href="#/product">
                Explore the product
              </a>
            </TextSection>
          </Band>
        </Match>
        <Match when={props.route === '/help'}>
          <Band motion={props.motion} class="site-help-band">
            <Help />
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
                The product is designed to use only the approved sources of your own university and
                their permitted visibility. Schools cannot search each other's documents. Citations identify original document versions and passage
                locations. Source text is treated as material to read, not instructions that can
                change account permissions.
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
            <TextSection title="What remains to be verified">
              <p>
                This is a pilot under development, with known application issues still awaiting
                resolution. There is no certification, uptime guarantee or claim of production
                readiness. Live service behavior, source quality and release reviews remain separate
                verification work.
              </p>
            </TextSection>
            <TextSection title="Report a concern carefully">
              <p>
                Contact the owner to arrange an appropriate private channel. Do not post
                credentials, private documents or exploitable account details in public.
              </p>
              <a class="site-link" href="#/contact">
                Contact about a concern
              </a>
            </TextSection>
          </Band>
        </Match>
        <Match when={props.route === '/privacy'}>
          <Band motion={props.motion} class="site-reading">
            <p class="site-draft-notice">
              <Badge>Draft pilot notice, subject to release review</Badge>
            </p>
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
              <a class="site-link" href="#/contact">
                Contact about privacy
              </a>
            </TextSection>
            <TextSection title="This website’s example">
              <p>
                The illustrative answer/source example uses fictional text stored with the website.
                Selecting a sample question does not send it to an answer service. The marketing
                pages add no external analytics or advertising scripts.
              </p>
            </TextSection>
          </Band>
        </Match>
        <Match when={props.route === '/terms'}>
          <Band motion={props.motion} class="site-reading">
            <p class="site-draft-notice">
              <Badge>Draft pilot material, pending public-release review</Badge>
            </p>
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
                before it can support ordinary answers.
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
              <a class="site-link" href="#/contact">
                Ask about these pilot notes
              </a>
            </TextSection>
          </Band>
        </Match>
        <Match when={props.route === '/changelog'}>
          <Band motion={props.motion} class="site-changelog">
            <Badge>Current pilot, undated</Badge>
            <For
              each={[
                [
                  'Question and evidence workspace',
                  'Direct questions, cited passages, source versions and feedback are part of the application. Unavailable and unsupported answers have explicit states.',
                ],
                [
                  'Accounts and collections',
                  'The application includes invitation-bound account flows, conversation history, document review and administration. Service availability and membership still govern access.',
                ],
                [
                  'Product website and example',
                  'The site now speaks to every university, with HCMIU as the first pilot. Product, student and university guides sit alongside a request form, help and trust notices. A synthetic example lets visitors inspect matching answer and source text.',
                ],
                [
                  'Clay hero illustration',
                  'One lazily loaded 3D scene shows a bookstack per school. It pauses off screen, renders still frames under reduced motion and falls back to a static illustration without WebGL. Page reveals follow the same motion preference.',
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
              <h2>Still under evaluation</h2>
              <p>
                Approved HCMIU coverage, live provider operation, human-reviewed English/Vietnamese
                answer quality and public-release readiness. Known application issues remain; this
                website update does not clear them.
              </p>
              <a class="site-link" href="#/product">
                Explore the current product
              </a>
            </div>
          </Band>
        </Match>
      </Switch>
      <Closing motion={props.motion} />
    </article>
  );
}
