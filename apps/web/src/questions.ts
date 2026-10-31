// The API's Answer and Conversation records carry no question text, so the questions asked in this
// tab are remembered here, in memory only, to title conversations and turns. Cleared on any account
// or institution change; never written to storage.
const byAnswer = new Map<string, string>();
const byConversation = new Map<string, string>();

export function rememberQuestion(answer: { id: string; conversation_id: string }, question: string) {
  byAnswer.set(answer.id, question);
  if (!byConversation.has(answer.conversation_id)) byConversation.set(answer.conversation_id, question);
}
export const questionFor = (answerId: string) => byAnswer.get(answerId);
export const conversationTitle = (conversationId: string) => byConversation.get(conversationId);
export function forgetQuestions() {
  byAnswer.clear();
  byConversation.clear();
}

const vietnamese = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;
/** Guesses the answer language from the question; null while there is too little text to tell. */
export function detectLanguage(text: string): 'en' | 'vi' | null {
  if (vietnamese.test(text)) return 'vi';
  return text.trim().split(/\s+/).filter((w) => /^[a-z']{2,}$/i.test(w)).length >= 3 ? 'en' : null;
}
