// Prefer the current consultation, then the earliest pending review in this account.
export function findPurchaseFollowUp(records, conversation) {
  return records.find(r => r.id === conversation?.attachedRecordId)
    || (conversation && records.findLast(r => r.conversationId === conversation.id))
    || records.filter(r => r.result === 'pending' && /^\d{4}-\d{2}-\d{2}$/.test(r.due || ''))
      .sort((a,b) => a.due.localeCompare(b.due))[0]
    || [...records].sort((a,b) => String(b.created || b.date || '').localeCompare(String(a.created || a.date || '')))[0]
    || null;
}
