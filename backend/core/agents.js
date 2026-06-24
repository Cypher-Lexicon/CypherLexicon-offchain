export const agents = [
  {
    id: 0,
    name: "CN_Macro",
    spec: "Chinese Macroeconomics & Monetary Policy",
    rep: 0.85,
    systemPrompt: "You are an expert in Chinese macroeconomics and monetary policy. Your job is to translate non-English financial news into a precise Polymarket prediction market question. Always respond with valid JSON only, no markdown."
  },
  {
    id: 1,
    name: "Generic_AI",
    spec: "General Purpose Translation & Markets",
    rep: 0.60,
    systemPrompt: "You are a general-purpose translator. Translate this news headline into a Polymarket-style prediction market question. Always respond with valid JSON only, no markdown."
  },
  {
    id: 2,
    name: "Asia_Expert",
    spec: "Asian Geopolitics & Financial Markets",
    rep: 0.92,
    systemPrompt: "You are an expert in Asian geopolitics and financial markets. Translate this news into a precise, well-scoped prediction market question. Always respond with valid JSON only, no markdown."
  }
];

export function calculateScore(bid, rep, confidenceScore) {
  // Bids are 100-1000, we normalize to 0-1
  const normalizedBid = (bid - 100) / 900;
  const rawScore = (normalizedBid * 0.40) + (rep * 0.35) + (confidenceScore * 0.25);
  // Round to 4 decimal places for clean display
  const score = Math.round(rawScore * 10000) / 10000;
  return { score, rawScore };
}

export function calculatePoints(bid) {
  return 10 + Math.floor(bid / 50);
}

export function calculateRoyalty(bid) {
  return Math.floor(bid * 0.15);
}

// ─── Pre-Filter: Heuristic Proposal Quality Scoring ──────────────────────
// Used before AI evaluation to cull obviously bad proposals.

const DATE_PATTERNS = [
  /\b(by|before|after|until|through|during|in)\s+(january|february|march|april|may|june|july|august|september|october|november|december|q[1-4]|20\d{2})\b/i,
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}[,.]?\s+20\d{2}\b/i,
  /\b(q[1-4])\s*(of\s*)?(20\d{2})\b/i,
  /\b(20\d{2}-\d{2}-\d{2})\b/,
  /\b(end of|early|mid|late)\s+(20\d{2}|q[1-4])\b/i,
];

const METRIC_PATTERNS = [
  /\d+(\.\d+)?\s*(%|percent|bps|basis points)/i,
  /\$\d+[,\d]*(\.\d+)?\s*(million|billion|trillion|mn|bn|tn)?/i,
  /\d+[,\d]*(\.\d+)?\s*(rmb|usd|eur|jpy|krw|yuan|yen|won)/i,
  /\b(above|below|exceed|higher than|lower than|greater than|more than|less than)\s+\d+/i,
  /\b\d+(\.\d+)?\s*(points|pips|bps)\b/i,
];

/**
 * Score a single proposal on heuristics alone (0.0–1.0).
 * Rewards: length, question format, date presence, specific metrics, proper nouns.
 */
export function heuristicScore(proposal) {
  if (!proposal || typeof proposal !== 'string') return 0;
  const p = proposal.trim();
  if (p.length < 10) return 0;

  let score = 0;

  // 1. Length reward (10–200 chars ideal) — up to 0.25
  if (p.length >= 50) score += 0.25;
  else if (p.length >= 30) score += 0.15;
  else if (p.length >= 20) score += 0.08;
  if (p.length > 300) score -= 0.05; // too long, probably spam

  // 2. Question format — up to 0.15
  if (p.endsWith('?') || (p.startsWith('Will ') && p.includes('?'))) score += 0.15;
  else if (p.startsWith('Will ') || p.startsWith('Is ') || p.startsWith('Can ')) score += 0.08;

  // 3. Date/time specificity — up to 0.25
  let dateHits = 0;
  for (const re of DATE_PATTERNS) {
    if (re.test(p)) dateHits++;
  }
  score += Math.min(dateHits * 0.08, 0.25);

  // 4. Metric/numeric specificity — up to 0.20
  let metricHits = 0;
  for (const re of METRIC_PATTERNS) {
    if (re.test(p)) metricHits++;
  }
  score += Math.min(metricHits * 0.07, 0.20);

  // 5. Contains proper nouns (acronyms, capitalized words) — up to 0.10
  const properNouns = p.match(/\b[A-Z]{2,}\b/g);
  if (properNouns) score += Math.min(properNouns.length * 0.03, 0.10);

  // 6. Resolution criterion indicators — up to 0.05
  const hasResolution = /\b(resolves?|verified|announce|report|official|confirm|publish|release)\b/i.test(p);
  if (hasResolution) score += 0.05;

  return Math.min(Math.max(score, 0), 1);
}

/**
 * Pre-filter proposals: cull any below threshold, keep at most maxProposals.
 * Returns array of { index, address, proposal, heuristicScore } for survivors.
 */
export function preFilterProposals(proposalsArr, threshold = 0.25, maxProposals = 10) {
  const scored = proposalsArr
    .map(p => ({ ...p, hScore: heuristicScore(p.proposal) }))
    .filter(p => p.hScore >= threshold);

  console.log(`[PreFilter] ${proposalsArr.length} proposals → ${scored.length} above threshold ${threshold}`);

  // Sort by heuristic score descending, return top N
  scored.sort((a, b) => b.hScore - a.hScore);
  return scored.slice(0, maxProposals);
}

// ─── Expert Evaluation ───────────────────────────────────────────────────

const EXPERT_EVALUATORS = [
  {
    name: 'Clarity_Judge',
    systemPrompt: 'You are an expert at evaluating prediction market questions for clarity and specificity. Score each proposal 0.0–1.0 on how clear the resolution criteria are. Return valid JSON only, no markdown.'
  },
  {
    name: 'Market_Viability',
    systemPrompt: 'You are an expert at assessing whether prediction market questions are interesting and tradeable. Score each proposal 0.0–1.0 on market viability — would people bet on this? Return valid JSON only, no markdown.'
  },
  {
    name: 'Objectivity_Guard',
    systemPrompt: 'You are an expert at checking whether prediction market questions can be objectively resolved. Score each proposal 0.0–1.0 on verifiability — is there a clear, indisputable data source? Return valid JSON only, no markdown.'
  },
];

/** Compute median from an array of numbers */
export function medianScore(scores) {
  if (!scores || scores.length === 0) return 0;
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Evaluate a single proposal with a single expert via Claude.
 * Returns { expertName, score (0–1), reasoning }.
 */
export async function evaluateProposalWithExpert(expert, proposal, bidderAddress, anthropic) {
  try {
    const prompt = `Score this prediction market proposal from bidder ${bidderAddress.slice(0, 10)}...:\n\n"${proposal}"\n\nReturn JSON: {"score": 0.0-1.0, "reasoning": "brief explanation"}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: expert.systemPrompt,
      messages: [{ role: 'user', content: prompt }]
    });

    let raw = response.content[0].text;
    raw = raw.replace(/```(?:json)?/gi, '').trim();
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) raw = raw.substring(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(raw);
    return { expertName: expert.name, score: Math.min(Math.max(parsed.score || 0.5, 0), 1), reasoning: parsed.reasoning || '' };
  } catch (e) {
    console.warn(`[Expert] ${expert.name} eval failed for ${bidderAddress.slice(0, 10)}...:`, e.message);
    return { expertName: expert.name, score: 0.5, reasoning: 'eval failed' };
  }
}

// Tailored high-quality mock responses in case API fails or is not provided.
// Maps newsIndex (0-3) to agentId (0-2) responses.
export const fallbackResponses = {
  0: { // PBOC announces 50bps RRR cut
    0: {
      title: "Will the People's Bank of China (PBOC) cut the Reserve Requirement Ratio (RRR) again by 50 basis points or more in 2026?",
      resolution_criteria: "This market resolves to YES if the People's Bank of China officially announces a further reduction of the Reserve Requirement Ratio for major financial institutions by at least 50 basis points (0.50%) on or before December 31, 2026, 11:59 PM UTC. The official announcement on the PBOC website will serve as the primary source of truth.",
      tags: ["China", "Macroeconomics", "PBOC", "Monetary Policy"],
      confidence_score: 0.95
    },
    1: {
      title: "Will China's central bank cut interest rates or RRR before the end of Q3 2026?",
      resolution_criteria: "This market resolves to YES if the People's Bank of China (PBOC) announces any reduction in the Reserve Requirement Ratio (RRR) or the Loan Prime Rate (LPR) between July 1, 2026, and September 30, 2026. The official announcements on pboc.gov.cn will be used to resolve this market.",
      tags: ["China", "Central Bank", "Economy"],
      confidence_score: 0.82
    },
    2: {
      title: "Will the PBOC's 50bps RRR cut lead to a China Q3 GDP growth rate above 5.0%?",
      resolution_criteria: "This market resolves to YES if the National Bureau of Statistics of China reports a Year-on-Year Q3 2026 GDP growth rate of 5.0% or higher. Verification will be based on the official press release scheduled for October 2026.",
      tags: ["Asia Geopolitics", "China GDP", "PBOC", "Financial Markets"],
      confidence_score: 0.90
    }
  },
  1: { // China Q2 GDP +4.8% YoY, below 5.2% forecast
    0: {
      title: "Will China's full-year 2026 GDP growth rate be reported at or above the official target of 5.0%?",
      resolution_criteria: "This market resolves to YES if the National Bureau of Statistics (NBS) of China releases the full-year 2026 GDP growth rate as 5.0% or greater. The release in early 2027 will be used for final resolution.",
      tags: ["GDP", "China", "Macroeconomics", "NBS"],
      confidence_score: 0.92
    },
    1: {
      title: "Will China's Q3 GDP growth rate be higher than 4.8%?",
      resolution_criteria: "This market resolves to YES if the official Q3 GDP year-on-year growth rate published by the Chinese National Bureau of Statistics (NBS) is strictly greater than 4.8%.",
      tags: ["China GDP", "Q3 Growth", "Economy"],
      confidence_score: 0.78
    },
    2: {
      title: "Will China announce a new fiscal stimulus package of 2 trillion RMB or more before October 1, 2026?",
      resolution_criteria: "This market resolves to YES if the State Council or Ministry of Finance of China officially approves and announces a new fiscal stimulus package or special sovereign bond issuance totaling 2.0 trillion RMB or more between June 1, 2026, and September 30, 2026.",
      tags: ["Fiscal Policy", "Stimulus", "State Council", "Asia Macro"],
      confidence_score: 0.88
    }
  },
  2: { // Bank of Japan holds at 0.25%, hints at hikes
    0: {
      title: "Will the Bank of Japan raise its policy interest rate above 0.25% in its September 2026 meeting?",
      resolution_criteria: "This market resolves to YES if the Bank of Japan (BOJ) announces an increase in its short-term policy interest rate to a level strictly greater than 0.25% at its scheduled monetary policy meeting ending in September 2026.",
      tags: ["BOJ", "Japan", "Interest Rates", "Yen"],
      confidence_score: 0.80
    },
    1: {
      title: "Will Japan's interest rate be higher than 0.25% by December 31, 2026?",
      resolution_criteria: "This market resolves to YES if the Bank of Japan's benchmark policy rate is set above 0.25% at any point prior to December 31, 2026, 11:59 PM UTC.",
      tags: ["Japan", "Interest Rate", "BOJ"],
      confidence_score: 0.85
    },
    2: {
      title: "Will the USD/JPY exchange rate fall below 145.00 on the day of the next Bank of Japan rate decision?",
      resolution_criteria: "This market resolves to YES if the USD/JPY spot rate trades below 145.00 at any point on the day of the next BOJ policy statement release, according to Bloomberg currency tick data.",
      tags: ["Yen", "BOJ", "Forex", "Japanese Markets"],
      confidence_score: 0.91
    }
  },
  3: { // Samsung Q2 operating profit ₩12T, beats estimates
    0: {
      title: "Will South Korea's chip export volume grow by more than 15% in Q3 2026?",
      resolution_criteria: "This market resolves to YES if the South Korean Ministry of Trade, Industry and Energy reports Q3 semiconductor export value growth of 15.0% or higher year-on-year.",
      tags: ["Semiconductors", "South Korea", "Global Trade"],
      confidence_score: 0.75
    },
    1: {
      title: "Will Samsung Electronics report a Q3 operating profit above 13 trillion Korean Won?",
      resolution_criteria: "This market resolves to YES if Samsung Electronics Co., Ltd. reports consolidated operating profit of 13.0 trillion KRW or more in its Q3 2026 earnings release.",
      tags: ["Samsung", "Earnings", "Tech"],
      confidence_score: 0.88
    },
    2: {
      title: "Will Samsung Electronics begin mass shipping of 12-layer HBM3E chips to Nvidia by October 1, 2026?",
      resolution_criteria: "This market resolves to YES if reliable industry sources (Bloomberg, Reuters, or official company PR) confirm that Samsung has started commercial mass-volume shipping of its 12-stack HBM3E memory chips to Nvidia for production use by October 1, 2026.",
      tags: ["Samsung", "Nvidia", "HBM3E", "Semiconductors", "Korea"],
      confidence_score: 0.94
    }
  }
};
