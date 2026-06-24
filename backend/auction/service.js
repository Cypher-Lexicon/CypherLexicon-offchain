/**
 * auction/service.js — Auction Business Logic (backend/auction)
 *
 * Handles proposal encoding/decoding for the expanded bid format:
 *   proposalHash = JSON({ question, description, options[], resolutionDate })
 */

/**
 * Encode a full proposal into a single string for on-chain storage.
 */
export function encodeProposal({ question, description, options, resolutionDate }) {
  return JSON.stringify({
    q: question || '',
    d: description || '',
    o: Array.isArray(options) ? options.filter(Boolean) : [],
    r: resolutionDate || ''
  });
}

/**
 * Decode a proposal string from the chain back into an object.
 */
export function decodeProposal(proposalHash) {
  try {
    const parsed = JSON.parse(proposalHash);
    return {
      question: parsed.q || '',
      description: parsed.d || '',
      options: parsed.o || [],
      resolutionDate: parsed.r || ''
    };
  } catch (e) {
    // Legacy: raw string was stored (just a question)
    return {
      question: proposalHash || '',
      description: '',
      options: [],
      resolutionDate: ''
    };
  }
}

/**
 * Compute a display-friendly score from a parsed proposal.
 * Rewards: length, question format, date presence, options provided, description given.
 */
export function heuristicScore(proposalHash) {
  const p = decodeProposal(proposalHash);
  if (!p.question) return 0;
  const text = p.question.trim();
  if (text.length < 10) return 0;

  let score = 0;
  if (text.length >= 50) score += 0.20;
  else if (text.length >= 30) score += 0.12;

  if (text.endsWith('?') || (text.startsWith('Will ') && text.includes('?'))) score += 0.15;
  else if (text.startsWith('Will ') || text.startsWith('Is ') || text.startsWith('Can ')) score += 0.08;

  const dateRe = /\b(20\d{2}|january|february|march|april|may|june|july|august|september|october|november|december|q[1-4])\b/i;
  if (dateRe.test(text + ' ' + p.resolutionDate)) score += 0.25;

  if (p.options.length >= 2) score += 0.20;
  else if (p.options.length === 1) score += 0.08;

  if (p.description && p.description.length > 20) score += 0.15;

  if (p.resolutionDate && p.resolutionDate.length > 0) score += 0.05;

  return Math.min(Math.max(score, 0), 1);
}

/**
 * Pre-filter proposals: cull any below threshold, keep at most maxProposals.
 */
export function preFilterProposals(proposalsArr, threshold = 0.20, maxProposals = 50) {
  const scored = proposalsArr
    .map(p => ({ ...p, hScore: heuristicScore(p.proposal) }))
    .filter(p => p.hScore >= threshold);

  scored.sort((a, b) => b.hScore - a.hScore);
  return scored.slice(0, maxProposals);
}
