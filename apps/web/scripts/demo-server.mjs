// intent: local presentation demo. Serves the built web app and a mock /api with a fictional
// "Example University" collection. No database, provider, email or network calls; nothing here is
// real university content. Usage: pnpm build && node scripts/demo-server.mjs [port]
// Web evidence, confidence values, the private space and the cached web pages are synthetic too:
// example.edu and news.example.org are reserved example domains, nothing is fetched, and the
// confidence numbers are hand-written for the demo, not scores from Jev or any other model.
// An approved passage's "on topic" part follows how well it matches the question, so a passage that
// merely shares a stray word is scored Low on topic and is not cited.
// status: done | next: keep in step with packages/contracts when shapes change | confidence: high
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.argv[2] || process.env.PORT || 4173);
// Tests shorten the pause before an answer; the demo keeps it long enough to show the waiting state.
const answerDelay = Number(process.env.DEMO_ANSWER_DELAY_MS ?? 1800);
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const uid = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const sha = (text) => createHash('sha256').update(text).digest('hex');
const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

const institution = { id: uid(1), slug: 'example', name: 'Example University', kind: 'school', domains: ['example.edu'], coverage: 'synthetic_demo' };
const second = { id: uid(2), slug: 'example-tech', name: 'Example Institute of Technology', kind: 'school', domains: ['tech.example.edu'], coverage: 'synthetic_demo' };
// Created by POST /api/v1/me/personal-space; private to the demo user and listed only for them.
const personal = { id: uid(3), slug: 'my-space-demo', name: 'My space (synthetic demo)', kind: 'personal', domains: [], coverage: 'synthetic_demo' };

// Hand-written demo confidence. The model label says so wherever a score is explained.
const demoModel = 'synthetic-demo (not a model score)';
const conf = (overall, school, source, relevance, answers) => ({ overall, school, source, relevance, answers, model: demoModel });
const day = 86_400_000;
const daysAgo = (days) => new Date(Date.now() - days * day).toISOString().replace(/\.\d+Z$/, 'Z');

// Synthetic web pages: one on the school's own example domain (high), one news post (medium, stale
// in the cache) and one forum thread (low). None of this text exists on the web.
const webPages = [
  { url: 'https://example.edu/registry/exam-timetable', domain: 'example.edu', title: 'Exam timetable notice (synthetic demo page)', language: 'en', fetchedDaysAgo: 1,
    section: 'Exam timetable', keys: 'exam exams examination timetable schedule final finals | lịch thi, kỳ thi',
    text: 'Synthetic demo text, not a real notice. The final examination timetable is published in the Student Portal two weeks before the examination period begins.',
    claim: { en: 'A page on the school site says the final exam timetable is published in the Student Portal two weeks before the exam period.', vi: 'Một trang trên website của trường cho biết lịch thi cuối kỳ được đăng trên Cổng sinh viên hai tuần trước kỳ thi.' },
    confidence: conf(0.88, 0.96, 0.95, 0.9, 0.84) },
  { url: 'https://news.example.org/campus/library-hours', domain: 'news.example.org', title: 'Campus news: library opening hours (synthetic demo page)', language: 'en', fetchedDaysAgo: 9,
    section: 'Library opening hours', keys: 'library hours opening open close closing late night | thư viện, giờ mở cửa',
    text: 'Synthetic demo text, not a real report. A campus news post says the library stays open until 22:00 on weekdays during the examination period.',
    claim: { en: 'A campus news post says the library stays open until 22:00 on weekdays during the exam period.', vi: 'Một bài tin tức cho biết thư viện mở cửa đến 22:00 các ngày trong tuần trong kỳ thi.' },
    confidence: conf(0.66, 0.82, 0.55, 0.86, 0.7) },
  { url: 'https://news.example.org/forum/parking', domain: 'news.example.org', title: 'Student forum thread about parking (synthetic demo page)', language: 'en', fetchedDaysAgo: 2,
    section: 'Forum reply', keys: 'parking park motorbike motorcycle bike car vehicle | gửi xe, bãi đỗ, xe máy',
    text: 'Synthetic demo text, not a real post. A forum reply claims motorbike parking is free after 18:00. The post gives no official reference.',
    claim: { en: 'A forum reply claims motorbike parking is free after 18:00, without an official reference.', vi: 'Một bài trả lời trên diễn đàn nói gửi xe máy miễn phí sau 18:00, không kèm nguồn chính thức.' },
    confidence: conf(0.41, 0.62, 0.28, 0.74, 0.38) },
];

// Each document: one source, one approved version, and passages with page/section locators.
// `claim` is the short answer sentence a passage supports, per language. `keys` are the passage's
// topics: English words, then after "|" Vietnamese phrases separated by commas. A Vietnamese phrase
// matches only as a whole, so "miễn phí" (free) is not mistaken for "học phí" (tuition).
const documents = [
  {
    title: 'Student Handbook 2026–27', kind: 'pdf', label: '2026–27 edition', language: 'en', url: 'https://example.edu/handbook.pdf',
    passages: [
      { page: 9, section: '3.1 Course registration', keys: 'register registration enrol enroll course add drop adding dropping portal semester | đăng ký học phần, đăng ký môn',
        text: 'Students register for courses through the Student Portal before each semester. Courses may be added or dropped during the first two weeks of the semester. After this period, changes require the Course Change Form (CC-2) signed by the academic advisor.',
        claim: { en: 'You can add or drop courses in the Student Portal during the first two weeks of the semester; after that you need form CC-2 signed by your academic advisor.', vi: 'Bạn có thể thêm hoặc hủy học phần trên Cổng sinh viên trong hai tuần đầu học kỳ; sau đó cần nộp mẫu CC-2 có chữ ký của cố vấn học tập.' } },
      { page: 11, section: '3.4 Attendance', keys: 'attendance absent absence miss class classes sick leave | vắng, nghỉ học, chuyên cần',
        text: 'Students are expected to attend at least 80% of scheduled class sessions for each course. Absences for medical reasons should be reported to the course lecturer with supporting documents within one week.',
        claim: { en: 'You need to attend at least 80% of class sessions; report medical absences to your lecturer with documents within one week.', vi: 'Bạn cần tham dự ít nhất 80% số buổi học; vắng vì lý do sức khỏe cần báo giảng viên kèm giấy tờ trong vòng một tuần.' } },
      { page: 14, section: '4.2 Transcripts', keys: 'transcript transcripts record records official copy grades | bảng điểm',
        text: 'Official transcripts are requested through the Student Portal under “Records”. Stamped copies are collected in person from the Registry desk, usually within three working days.',
        claim: { en: 'Request an official transcript in the Student Portal under “Records” and collect the stamped copy from the Registry desk, usually within three working days.', vi: 'Yêu cầu bảng điểm chính thức trên Cổng sinh viên, mục “Records”, và nhận bản có đóng dấu tại quầy Phòng Đào tạo, thường trong ba ngày làm việc.' } },
      { page: 18, section: '5.1 Academic warning', keys: 'gpa warning probation academic standing fail low grade | cảnh báo học vụ, điểm trung bình',
        text: 'A student whose semester GPA falls below 2.0 receives an academic warning. Two consecutive warnings lead to academic probation and a required meeting with the faculty advisor.',
        claim: { en: 'A semester GPA below 2.0 leads to an academic warning; two warnings in a row lead to probation and a required advisor meeting.', vi: 'Điểm trung bình học kỳ dưới 2.0 sẽ bị cảnh báo học vụ; hai lần liên tiếp sẽ bị đình chỉ có điều kiện và phải gặp cố vấn khoa.' } },
      { page: 22, section: '6.3 Library borrowing', keys: 'library book books borrow borrowing loan renew return | thư viện, mượn sách',
        text: 'Undergraduate students may borrow up to five books for fourteen days. Loans can be renewed twice online unless another reader has reserved the book.',
        claim: { en: 'You can borrow up to five library books for 14 days and renew online twice unless someone has reserved them.', vi: 'Sinh viên được mượn tối đa năm cuốn sách trong 14 ngày và gia hạn trực tuyến hai lần nếu sách chưa có người đặt trước.' } },
    ],
  },
  {
    title: 'Quy chế học vụ — Đại học Ví Dụ', kind: 'pdf', label: 'Bản 2026', language: 'vi', url: 'https://example.edu/quy-che.pdf',
    passages: [
      { page: 4, section: 'Điều 8. Học lại', keys: 'retake repeat fail failed | học lại, thi lại, trượt môn',
        text: 'Sinh viên có học phần bị điểm F phải đăng ký học lại học phần đó trong học kỳ kế tiếp có mở lớp. Điểm học lại thay thế điểm cũ khi tính điểm trung bình tích lũy.',
        claim: { en: 'If you fail a course (grade F) you must retake it in the next semester it is offered; the new grade replaces the old one in your cumulative GPA.', vi: 'Học phần bị điểm F phải đăng ký học lại ở học kỳ kế tiếp có mở lớp; điểm học lại thay thế điểm cũ khi tính điểm trung bình tích lũy.' } },
      { page: 6, section: 'Điều 12. Bảo lưu kết quả học tập', keys: 'defer deferral leave absence suspend pause studies | bảo lưu, tạm dừng, nghỉ học',
        text: 'Sinh viên được bảo lưu kết quả học tập tối đa hai học kỳ. Hồ sơ bảo lưu nộp tại Phòng Đào tạo trước ngày bắt đầu học kỳ, kèm đơn có ý kiến của cố vấn học tập.',
        claim: { en: 'You can defer your studies for up to two semesters by submitting an application, with your advisor’s comment, to the Academic Affairs Office before the semester starts.', vi: 'Bạn được bảo lưu tối đa hai học kỳ; nộp hồ sơ tại Phòng Đào tạo trước khi học kỳ bắt đầu, kèm đơn có ý kiến của cố vấn học tập.' } },
    ],
  },
  {
    title: 'Scholarships and Financial Aid Guide', kind: 'pdf', label: 'Autumn intake', language: 'en', url: 'https://example.edu/scholarships.pdf',
    passages: [
      { page: 3, section: '2. Merit scholarships', keys: 'scholarship scholarships merit award funding financial aid | học bổng',
        text: 'Merit scholarships are awarded each semester to students with a GPA of 3.6 or higher and no disciplinary record. Eligible students are notified by email; no separate application is needed.',
        claim: { en: 'Merit scholarships go to students with a GPA of 3.6 or higher and no disciplinary record; eligible students are emailed and do not need to apply.', vi: 'Học bổng khuyến khích dành cho sinh viên có điểm trung bình từ 3.6 và không vi phạm kỷ luật; sinh viên đủ điều kiện được thông báo qua email, không cần nộp đơn.' } },
      { page: 5, section: '4. Tuition instalments', keys: 'tuition fee fees payment pay instalment installment | học phí, đóng tiền',
        text: 'Tuition may be paid in two instalments per semester. The second instalment is due by week eight. Requests are made through the Finance Office page in the Student Portal.',
        claim: { en: 'Tuition can be paid in two instalments per semester, with the second due by week eight; request this on the Finance Office page in the Student Portal.', vi: 'Học phí có thể đóng làm hai đợt mỗi học kỳ, đợt hai hạn chót tuần thứ tám; đăng ký qua trang Phòng Tài chính trên Cổng sinh viên.' } },
    ],
  },
  {
    title: 'IT Services FAQ', kind: 'text', label: 'Current', language: 'en', url: null,
    passages: [
      { page: null, section: 'Wi-Fi access', keys: 'wifi wi-fi internet network eduroam connect | mạng',
        text: 'Campus Wi-Fi uses the network “Example-Campus”. Sign in with your student email and portal password. Guests can request a one-day code at the library desk.',
        claim: { en: 'Connect to the “Example-Campus” Wi-Fi with your student email and portal password; guests can get a one-day code at the library desk.', vi: 'Kết nối Wi-Fi “Example-Campus” bằng email sinh viên và mật khẩu cổng thông tin; khách có thể xin mã dùng một ngày tại quầy thư viện.' } },
      { page: null, section: 'Password reset', keys: 'password reset forgot account login locked | mật khẩu',
        text: 'Portal passwords can be reset from the sign-in page with “Forgot password”. Accounts locked after five failed attempts unlock automatically after thirty minutes.',
        claim: { en: 'Reset your portal password with “Forgot password” on the sign-in page; a locked account unlocks automatically after 30 minutes.', vi: 'Đặt lại mật khẩu bằng “Forgot password” trên trang đăng nhập; tài khoản bị khóa sẽ tự mở sau 30 phút.' } },
    ],
  },
  {
    title: 'Academic Forms Index', kind: 'url', label: 'Revised edition', language: 'en', url: 'https://example.edu/forms',
    passages: [
      { page: 3, section: 'Course changes', keys: 'form forms cc-2 cc-1 course change | mẫu đơn',
        text: 'Form CC-2 replaces CC-1 for all course changes. CC-1 remains in the archive for reference and is no longer accepted.',
        claim: { en: 'Use form CC-2 for course changes; the older CC-1 is no longer accepted.', vi: 'Dùng mẫu CC-2 khi thay đổi học phần; mẫu CC-1 cũ không còn được chấp nhận.' } },
    ],
  },
];

let n = 100;
const sources = [], versions = [], chunks = [];
for (const doc of documents) {
  const source = { id: uid(n++), institution_id: institution.id, title: doc.title, kind: doc.kind, original_url: doc.url, visibility: 'institution', current_version_id: null, created_at: '2026-08-15T00:00:00Z' };
  const body = doc.passages.map((p) => p.text).join('\n\n');
  const version = { id: uid(n++), source_id: source.id, institution_id: institution.id, label: doc.label, sha256: sha(body), status: 'approved', indexing: 'ready', effective_from: '2026-08-15T00:00:00Z', effective_until: null, created_at: '2026-08-15T00:00:00Z' };
  source.current_version_id = version.id;
  sources.push(source); versions.push(version);
  doc.passages.forEach((p, ordinal) => chunks.push({ id: uid(n++), institution_id: institution.id, source_id: source.id, version_id: version.id, ordinal, text: p.text, locator: { page: p.page, section: p.section, start_char: 0, end_char: p.text.length }, language: doc.language, keys: p.keys, claim: p.claim, title: doc.title, label: doc.label, url: doc.url }));
}
// One older archived version, so the reader can show a historical citation.
versions.push({ id: uid(n++), source_id: sources[0].id, institution_id: institution.id, label: '2025–26 edition', sha256: sha('previous'), status: 'archived', indexing: 'ready', effective_from: '2025-08-15T00:00:00Z', effective_until: '2026-08-14T00:00:00Z', created_at: '2025-08-15T00:00:00Z' });

const state = { user: 'demo-student', admin: true, personal: false, conversations: [], answers: new Map(), questions: new Map(), feedback: [], jobs: new Map(), spent: 1_240_000, webDocuments: [] };
// Each institution keeps its own cached copy of the synthetic pages, as the real cache is tenant scoped.
function cacheWebPages(institutionId) {
  webPages.forEach((web) => {
    const fetched = daysAgo(web.fetchedDaysAgo);
    state.webDocuments.push({ id: uid(n++), institution_id: institutionId, url: web.url, final_url: web.url, domain: web.domain, title: web.title, language: web.language, fetched_at: fetched, stale_after: new Date(Date.parse(fetched) + 7 * day).toISOString().replace(/\.\d+Z$/, 'Z'), sha256: sha(web.text), state: web.fetchedDaysAgo > 7 ? 'stale' : 'fresh', source_id: null, confidence: web.confidence, version_id: uid(n++), chunk_id: uid(n++), web });
  });
}
cacheWebPages(institution.id);
const documentOf = ({ version_id, chunk_id, web, ...document }) => document;
const institutions = () => [institution, second, ...(state.user && state.personal ? [personal] : [])];
// The demo user manages the first school and their own space, and is a student of the second
// school, which has no documents yet: questions there are answered with an abstention.
const roleOf = (id) =>
  id === institution.id ? (state.admin ? 'admin' : 'student')
    : id === second.id ? 'student'
      : state.personal && id === personal.id ? 'admin'
        : undefined;
const memberOf = (id) => roleOf(id) !== undefined;
const adminOf = (id) => roleOf(id) === 'admin';

const evidenceById = new Map();
// Approved passages carry no domain or fetch time; web passages always carry both and stay "web".
const evidenceFor = (chunk, confidence) => {
  const evidence = { id: randomUUID(), source_id: chunk.source_id, version_id: chunk.version_id, chunk_id: chunk.id, institution_id: chunk.institution_id, title: chunk.title, version_label: chunk.label, locator: chunk.locator, quote: chunk.text, original_url: chunk.url, origin: 'approved', domain: null, retrieved_at: null, confidence };
  evidenceById.set(evidence.id, evidence);
  return evidence;
};
const webEvidenceFor = (document) => {
  const { web } = document;
  const evidence = { id: randomUUID(), source_id: document.id, version_id: document.version_id, chunk_id: document.chunk_id, institution_id: document.institution_id, title: document.title, version_label: 'Cached copy', locator: { page: null, section: web.section, start_char: 0, end_char: web.text.length }, quote: web.text, original_url: document.final_url, origin: 'web', domain: document.domain, retrieved_at: document.fetched_at, confidence: document.confidence };
  evidenceById.set(evidence.id, evidence);
  return evidence;
};

const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const tokens = (s) => fold(s).split(/[^a-z0-9-]+/).filter(Boolean);
const words = (s) => tokens(s).filter((w) => w.length > 2);
// How well a passage matches a question: `topics` counts its key words and whole key phrases found
// in the question, `stray` counts other shared words (body or section text), which say little.
function match(question, keyText, bodyText) {
  const [english = '', vietnamese = ''] = keyText.split('|');
  const asked = new Set(words(question));
  const sentence = ` ${tokens(question).join(' ')} `;
  const keyWords = new Set(words(english));
  const phrases = vietnamese.split(',').map((phrase) => tokens(phrase).join(' ')).filter(Boolean);
  const body = new Set(words(bodyText));
  let topics = phrases.filter((phrase) => sentence.includes(` ${phrase} `)).length;
  let stray = 0;
  for (const word of asked) {
    if (keyWords.has(word)) topics++;
    else if (body.has(word)) stray++;
  }
  return { topics, stray, score: topics * 3 + stray };
}
// Hand-written demo levels for approved passages, shaped like the real scoring: an approved passage
// counts as the school's own trusted source (1.0 each), and overall = answers * sqrt(on topic).
const overallOf = (relevance, answers) => Math.round(answers * Math.sqrt(relevance) * 1000) / 1000;
const approvedConfidence = ({ topics }) => {
  const [relevance, answers] = topics >= 2 ? [0.93, 0.9] : topics === 1 ? [0.72, 0.8] : [0.22, 0.2];
  return conf(overallOf(relevance, answers), 1, 1, relevance, answers);
};
// Below this "on topic" value a passage reads Low and is left out of the answer.
const onTopic = 0.6;
// Approved passages are searched for their own institution; cached web pages join only when the
// question asked for discovery. Blocked pages are gone from the cache, so they never match.
function retrieve(question, institutionId, discover) {
  const approved = chunks
    .filter((chunk) => chunk.institution_id === institutionId)
    .map((chunk) => {
      const matched = match(question, chunk.keys, `${chunk.section} ${chunk.text}`);
      return { ...matched, confidence: approvedConfidence(matched), claim: chunk.claim, chunk };
    });
  const inUse = new Set(approved.map((r) => r.chunk.source_id));
  const web = !discover ? [] : state.webDocuments
    .filter((document) => document.institution_id === institutionId && !inUse.has(document.source_id))
    .map((document) => ({ ...match(question, document.web.keys, `${document.web.section} ${document.web.text}`), confidence: document.confidence, claim: document.web.claim, document }));
  return [...approved, ...web]
    // A passage that only shares stray words is off topic, whatever its other parts say.
    .filter((r) => r.topics > 0 && r.confidence.relevance >= onTopic)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
}
const explain = {
  none: { en: 'No approved document or cached web page answers this question. Try a more specific question or browse the source library.', vi: 'Không có tài liệu đã duyệt hay trang web nào trả lời câu hỏi này. Hãy thử hỏi cụ thể hơn hoặc xem thư viện tài liệu.' },
  medium: { en: 'This is the closest match in the demo collection; read the passage to confirm it fits your question.', vi: 'Đây là kết quả gần nhất trong bộ dữ liệu demo; hãy đọc đoạn trích để kiểm tra.' },
  low: { en: 'This rests on a web page with low confidence in the demo data. Treat it as a lead, not as a rule.', vi: 'Câu trả lời dựa trên một trang web có độ tin cậy thấp trong dữ liệu demo. Hãy xem đây là gợi ý, không phải quy định.' },
};
function answer(ask) {
  const hits = retrieve(ask.question, ask.institution_id, ask.discover === true);
  const conversation_id = ask.conversation_id && state.answers.has(ask.conversation_id) ? ask.conversation_id : randomUUID();
  const base = { id: randomUUID(), conversation_id, institution_id: ask.institution_id, language: ask.language, created_at: now() };
  let result;
  if (!hits.length)
    result = { ...base, status: 'abstained', claims: [], evidence: [], explanation: explain.none[ask.language] ?? explain.none.en, confidence: null };
  else {
    const evidence = hits.map((h) => (h.document ? webEvidenceFor(h.document) : evidenceFor(h.chunk, h.confidence)));
    const claims = hits.map((h, i) => ({ text: h.claim[ask.language] ?? h.claim.en, evidence_ids: [evidence[i].id], confidence: evidence[i].confidence.overall }));
    // The answer is only as sure as its weakest claim.
    const overall = Math.min(...claims.map((claim) => claim.confidence));
    const note = overall >= 0.8 ? null : overall >= 0.6 ? explain.medium : explain.low;
    result = { ...base, status: note ? 'qualified' : 'answered', claims, evidence, explanation: note ? note[ask.language] ?? note.en : null, confidence: overall };
  }
  if (!state.answers.has(conversation_id)) {
    state.answers.set(conversation_id, []);
    state.conversations.unshift({ id: conversation_id, institution_id: ask.institution_id, created_at: base.created_at });
  }
  state.answers.get(conversation_id).push(result);
  state.questions.set(result.id, ask.question);
  return result;
}

// Seed one conversation and one open report so History and Admin are not empty.
const seeded = answer({ institution_id: institution.id, question: 'How do I get an official transcript?', language: 'en' });
answer({ institution_id: institution.id, question: 'What happens if my GPA is low?', language: 'en', conversation_id: seeded.conversation_id });
state.feedback.push({ id: uid(9000), institution_id: institution.id, answer_id: seeded.id, category: 'outdated', evidence_id: seeded.evidence[0]?.id ?? null, comment: 'The Registry desk moved to building B this term.', status: 'open', created_at: now() });

const cap = (state) => ({ state, reason: state === 'available' ? 'ready' : 'not_configured' });
const error = (code, message, status) => ({ status, body: { error: { code, message, request_id: randomUUID(), retryable: false } } });
const page = (items) => ({ items, next_cursor: null });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const me = () => ({ identity: { user_id: state.user, session_id: 'demo-session', email_verified: true, expires_at: '2027-12-31T00:00:00Z' }, memberships: institutions().map((item) => ({ institution_id: item.id, role: roleOf(item.id) })) });

async function api(method, path, body) {
  const route = (pattern) => path.match(new RegExp(`^/api/v1/institutions/[^/]+${pattern}$`));
  // The institution named in the path scopes every read and write below.
  const scope = path.match(/^\/api\/v1\/institutions\/([^/]+)/)?.[1];
  const own = (items) => items.filter((item) => item.institution_id === scope);
  if (path === '/api/v1/capabilities') return { body: { mode: 'mock', answers: cap('available'), indexing: cap('available'), discovery: cap('available'), google: cap('disabled'), email: cap('available'), identity: cap('available') } };
  if (path === '/api/v1/institutions') return { body: page(institutions()) };
  if (path.startsWith('/api/auth/')) {
    const action = path.slice('/api/auth/'.length);
    if (action === 'sign-out') { state.user = null; return { body: { success: true } }; }
    if (action === 'sign-in/email' || action === 'sign-up/email') { await sleep(500); state.user = 'demo-student'; return { body: { user: { id: state.user } } }; }
    if (action === 'invitations/redeem') return state.user ? { body: { institution_id: institution.id, role: 'student' } } : error('unauthenticated', 'Sign in first.', 401);
    if (action === 'delete-user') return { body: { success: true, message: 'Verification email sent' } };
    return { body: { status: true } };
  }
  if (path === '/api/v1/me') return state.user ? { body: me() } : error('unauthenticated', 'Sign in to continue.', 401);
  if (!state.user) return error('unauthenticated', 'Sign in to continue.', 401);
  if (path === '/api/v1/me/personal-space' && method === 'POST') {
    // One private space per user: the first call creates it, later calls return the same one.
    if (!state.personal) { state.personal = true; cacheWebPages(personal.id); }
    return { status: 201, body: personal };
  }
  if (path === '/api/v1/answers' && method === 'POST') {
    // Any member may ask; a school with no documents and no cached pages answers with an abstention.
    if (!memberOf(body.institution_id)) return error('forbidden', 'Membership required.', 403);
    await sleep(answerDelay); // long enough to show the answer loader
    return { body: answer(body) };
  }
  let m;
  if (scope && !memberOf(scope)) return { body: page([]) };
  if ((m = route('/web-documents')) && method === 'GET') return adminOf(scope) ? { body: page(own(state.webDocuments).map(documentOf)) } : error('forbidden', 'Administrator membership required.', 403);
  if ((m = route('/web-documents/([^/]+)')) && method === 'PATCH') {
    if (!adminOf(scope)) return error('forbidden', 'Administrator membership required.', 403);
    const document = own(state.webDocuments).find((d) => d.id === m[1]);
    if (!document) return error('not_found', 'Web page not found.', 404);
    if (body.action === 'promote' && !document.source_id) {
      // Promotion enters the normal review flow: a URL source with one version waiting for review.
      const source = { id: randomUUID(), institution_id: scope, title: document.title, kind: 'url', original_url: document.final_url, visibility: 'institution', current_version_id: null, created_at: now() };
      sources.push(source);
      versions.push({ id: randomUUID(), source_id: source.id, institution_id: scope, label: `Fetched ${document.fetched_at.slice(0, 10)}`, sha256: document.sha256, status: 'pending_review', indexing: 'ready', effective_from: null, effective_until: null, created_at: now() });
      document.source_id = source.id;
    } else if (body.action === 'refresh') {
      document.fetched_at = now();
      document.stale_after = new Date(Date.now() + 7 * day).toISOString().replace(/\.\d+Z$/, 'Z');
      document.state = 'fresh';
    } else if (body.action === 'block') state.webDocuments = state.webDocuments.filter((d) => d !== document);
    return { body: documentOf(document) };
  }
  if ((m = route('/domains')) && method === 'PUT') {
    if (!adminOf(scope)) return error('forbidden', 'Administrator membership required.', 403);
    const target = institutions().find((i) => i.id === scope);
    if (!Array.isArray(body.domains) || !body.domains.length || body.domains.length > 20 || body.domains.some((d) => typeof d !== 'string' || !d || d.length > 253)) return error('invalid_request', 'Provide 1 to 20 domains.', 400);
    target.domains = [...body.domains];
    return { body: target };
  }
  if ((m = route('/sources')) && method === 'GET') return { body: page(own(sources)) };
  if ((m = route('/sources')) && method === 'POST') {
    const source = { id: randomUUID(), institution_id: scope, title: body.title, kind: body.kind, original_url: body.original_url ?? null, visibility: body.visibility, current_version_id: null, created_at: now() };
    sources.push(source); return { status: 201, body: source };
  }
  if ((m = route('/sources/([^/]+)'))) return sources.find((s) => s.id === m[1]) ? { body: sources.find((s) => s.id === m[1]) } : error('not_found', 'Source not found.', 404);
  if ((m = route('/sources/([^/]+)/versions')) && method === 'GET') return { body: page(versions.filter((v) => v.source_id === m[1])) };
  if ((m = route('/sources/([^/]+)/(?:versions|fetch)'))) {
    const version = { id: randomUUID(), source_id: m[1], institution_id: scope, label: 'Uploaded version', sha256: sha(randomUUID()), status: 'pending_review', indexing: 'ready', effective_from: null, effective_until: null, created_at: now() };
    versions.push(version);
    const job = { id: randomUUID(), institution_id: scope, version_id: version.id, state: 'succeeded', error_code: null };
    state.jobs.set(job.id, job); return { status: 202, body: job };
  }
  if ((m = route('/versions/([^/]+)/file'))) {
    // Same headers as the Rust download handler: an opaque attachment the browser never renders inline.
    const text = chunks.filter((c) => c.version_id === m[1]).map((c) => `${c.locator.section}\n\n${c.text}`).join('\n\n\n');
    return { raw: text || 'Original file not available in the demo.', type: 'application/octet-stream', headers: { 'content-disposition': 'attachment', 'content-security-policy': 'sandbox', 'x-content-type-options': 'nosniff' } };
  }
  // Listing every passage of a version is an admin review operation in the real API.
  if ((m = route('/versions/([^/]+)/chunks'))) return adminOf(scope) ? { body: page(chunks.filter((c) => c.version_id === m[1]).map(strip)) } : error('forbidden', 'Administrator membership required.', 403);
  if ((m = route('/versions/([^/]+)/actions'))) {
    if (!adminOf(scope)) return error('forbidden', 'Administrator membership required.', 403);
    const version = versions.find((v) => v.id === m[1] && v.institution_id === scope);
    if (version) version.status = body.action === 'approve' ? 'approved' : body.action === 'archive' ? 'archived' : version.status;
    if (version && body.action === 'approve') {
      const source = sources.find((s) => s.id === version.source_id);
      if (source) source.current_version_id = version.id;
      // An approved copy of a promoted web page becomes a passage of its own: from then on it is
      // cited as a document of this collection, and the cached web copy steps aside.
      const promoted = state.webDocuments.find((d) => d.source_id === version.source_id);
      if (promoted && !chunks.some((c) => c.version_id === version.id))
        chunks.push({ id: randomUUID(), institution_id: scope, source_id: version.source_id, version_id: version.id, ordinal: 0, text: promoted.web.text, locator: { page: null, section: promoted.web.section, start_char: 0, end_char: promoted.web.text.length }, language: promoted.language, keys: promoted.web.keys, claim: promoted.web.claim, title: promoted.title, label: version.label, url: promoted.final_url });
    }
    const job = { id: randomUUID(), institution_id: scope, version_id: m[1], state: 'succeeded', error_code: null };
    state.jobs.set(job.id, job); return { body: job };
  }
  if ((m = route('/versions/([^/]+)'))) return versions.find((v) => v.id === m[1]) ? { body: versions.find((v) => v.id === m[1]) } : error('not_found', 'Version not found.', 404);
  if ((m = route('/chunks/([^/]+)'))) return chunks.find((c) => c.id === m[1]) ? { body: strip(chunks.find((c) => c.id === m[1])) } : error('not_found', 'Passage not found.', 404);
  if ((m = route('/citations/([^/]+)'))) return evidenceById.get(m[1])?.institution_id === scope ? { body: evidenceById.get(m[1]) } : error('not_found', 'Citation not found.', 404);
  if ((m = route('/jobs/([^/]+)'))) return { body: state.jobs.get(m[1]) ?? { id: m[1], institution_id: scope, version_id: versions[0].id, state: 'succeeded', error_code: null } };
  if ((m = route('/conversations'))) return { body: page(own(state.conversations)) };
  if ((m = route('/conversations/([^/]+)/answers'))) return { body: page(own(state.answers.get(m[1]) ?? [])) };
  if ((m = route('/conversations/([^/]+)')) && method === 'DELETE') {
    state.conversations = state.conversations.filter((c) => c.id !== m[1]);
    state.answers.delete(m[1]);
    return { status: 204, body: null };
  }
  if ((m = route('/conversations/([^/]+)'))) return { body: state.conversations.find((c) => c.id === m[1]) ?? null };
  if ((m = route('/feedback')) && method === 'POST') {
    const item = { id: randomUUID(), institution_id: scope, answer_id: body.answer_id, category: body.category, evidence_id: body.evidence_id ?? null, comment: body.comment ?? null, status: 'open', created_at: now() };
    state.feedback.unshift(item); return { status: 201, body: item };
  }
  if ((m = route('/feedback'))) return { body: page(own(state.feedback)) };
  if ((m = route('/feedback/([^/]+)/context'))) {
    const feedback = state.feedback.find((f) => f.id === m[1]);
    const found = feedback && [...state.answers.values()].flat().find((a) => a.id === feedback.answer_id);
    return found ? { body: { feedback, question: state.questions.get(found.id) ?? '', answer: found } } : error('not_found', 'Report context not found.', 404);
  }
  if ((m = route('/feedback/([^/]+)'))) {
    const item = state.feedback.find((f) => f.id === m[1]);
    if (item) item.status = body.status;
    return item ? { body: item } : error('not_found', 'Report not found.', 404);
  }
  if ((m = route('/graph/entities'))) return { status: 201, body: { id: randomUUID(), institution_id: scope, kind: body.kind, label: body.label } };
  if ((m = route('/graph/edges/([^/]+)'))) {
    const edge = own(graph).find((e) => e.id === m[1]);
    if (edge && body.status) edge.status = body.status;
    return edge ? { body: edge } : error('not_found', 'Relation not found.', 404);
  }
  if ((m = route('/graph/edges')) && method === 'POST') return error('not_found', 'Not available in the demo.', 404);
  if ((m = route('/graph'))) return { body: page(own(graph)) };
  if ((m = route('/budget'))) return { body: { month: now().slice(0, 7), cap_micro_usd: 50000000, spent_micro_usd: state.spent, reserved_micro_usd: 150000, currency: 'USD' } };
  return error('not_found', 'Not available in the demo.', 404);
}
const strip = ({ keys, claim, title, label, url, ...chunk }) => chunk;
// Relations carry their own confidence: one backed by an approved passage, one by a web page.
const graph = [
  { id: uid(8000), institution_id: institution.id, from_entity_id: uid(8001), to_entity_id: uid(8002), relation: 'requires form', status: 'candidate', confidence: 0.86, evidence: [evidenceFor(chunks[0], approvedConfidence({ topics: 2 }))] },
  { id: uid(8003), institution_id: institution.id, from_entity_id: uid(8004), to_entity_id: uid(8005), relation: 'opening hours reported by', status: 'candidate', confidence: 0.58, evidence: [webEvidenceFor(state.webDocuments[1])] },
];

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    let body;
    if (req.method !== 'GET') {
      let raw = '';
      for await (const part of req) raw += part;
      try { body = raw && req.headers['content-type']?.includes('json') ? JSON.parse(raw) : {}; } catch { body = {}; }
    }
    const result = await api(req.method, url.pathname, body ?? {});
    if (result.raw !== undefined) { res.writeHead(200, { 'content-type': result.type, ...(result.headers ?? {}) }); return res.end(result.raw); }
    if (result.status === 204) { res.writeHead(204, { 'cache-control': 'no-store' }); return res.end(); }
    res.writeHead(result.status ?? 200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(result.body));
  }
  let file = normalize(join(dist, decodeURIComponent(url.pathname)));
  if (!file.startsWith(normalize(dist))) { res.writeHead(403); return res.end(); }
  try { if (!(await stat(file)).isFile()) throw new Error(); } catch { file = join(dist, 'index.html'); }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(await readFile(file));
}).listen(port, '127.0.0.1', () => console.log(`noti.school demo: http://127.0.0.1:${port}  (mock data, signed in as a demo admin)`));
