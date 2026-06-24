/**
 * Tests for core/agents.js — Agent definitions, scoring, heuristic, pre-filter, expert evaluation
 *
 * These are the AI agent orchestration and proposal evaluation functions
 * that power the auction phase's filtering pipeline.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  agents,
  calculateScore,
  calculatePoints,
  calculateRoyalty,
  heuristicScore,
  preFilterProposals,
  medianScore,
  evaluateProposalWithExpert,
  fallbackResponses,
} from '../../backend/core/agents.js';

// ─── Agent Definitions ──────────────────────────────────────────────────

describe('agents', () => {
  it('should export 3 agents', () => {
    expect(agents).toHaveLength(3);
  });

  it('should have valid reputation scores', () => {
    agents.forEach(a => {
      expect(a.rep).toBeGreaterThan(0);
      expect(a.rep).toBeLessThanOrEqual(1);
    });
  });

  it('each agent should have required fields', () => {
    agents.forEach(a => {
      expect(a).toHaveProperty('id');
      expect(a).toHaveProperty('name');
      expect(a).toHaveProperty('spec');
      expect(a).toHaveProperty('rep');
      expect(a).toHaveProperty('systemPrompt');
    });
  });
});

// ─── calculateScore ─────────────────────────────────────────────────────

describe('calculateScore', () => {
  it('should compute a weighted score from bid, reputation, and confidence', () => {
    const result = calculateScore(550, 0.85, 0.90);
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('rawScore');
    // bid=550 → normalized = (550-100)/900 = 0.5
    // rawScore = 0.5*0.40 + 0.85*0.35 + 0.90*0.25 = 0.20 + 0.2975 + 0.225 = 0.7225
    expect(result.rawScore).toBeCloseTo(0.7225, 4);
    expect(result.score).toBeCloseTo(0.7225, 4);
  });

  it('should handle minimum bid (100)', () => {
    const result = calculateScore(100, 0.5, 0.5);
    // normalized = (100-100)/900 = 0
    // rawScore = 0*0.40 + 0.5*0.35 + 0.5*0.25 = 0 + 0.175 + 0.125 = 0.30
    expect(result.rawScore).toBeCloseTo(0.30, 4);
    expect(result.score).toBeCloseTo(0.30, 4);
  });

  it('should handle maximum bid (1000)', () => {
    const result = calculateScore(1000, 1.0, 1.0);
    // normalized = (1000-100)/900 = 1.0
    // rawScore = 1.0*0.40 + 1.0*0.35 + 1.0*0.25 = 1.0
    expect(result.rawScore).toBeCloseTo(1.0, 4);
    expect(result.score).toBeCloseTo(1.0, 4);
  });

  it('should round score to 4 decimal places', () => {
    const result = calculateScore(333, 0.77, 0.63);
    const decimalPlaces = result.score.toString().split('.')[1]?.length || 0;
    expect(decimalPlaces).toBeLessThanOrEqual(4);
  });

  it('should handle zero-edge inputs without crashing', () => {
    const result = calculateScore(0, 0, 0);
    // normalized = (0-100)/900 = -0.111..., clamped by usage but not in function
    expect(typeof result.score).toBe('number');
    expect(typeof result.rawScore).toBe('number');
  });

  it('should be deterministic (same inputs → same outputs)', () => {
    const a = calculateScore(500, 0.8, 0.7);
    const b = calculateScore(500, 0.8, 0.7);
    expect(a.score).toBe(b.score);
    expect(a.rawScore).toBe(b.rawScore);
  });
});

// ─── calculatePoints ────────────────────────────────────────────────────

describe('calculatePoints', () => {
  it('should calculate points correctly', () => {
    expect(calculatePoints(100)).toBe(12); // 10 + floor(100/50) = 10 + 2
    expect(calculatePoints(500)).toBe(20); // 10 + floor(500/50) = 10 + 10
    expect(calculatePoints(1000)).toBe(30); // 10 + floor(1000/50) = 10 + 20
  });

  it('should handle minimum bid', () => {
    expect(calculatePoints(0)).toBe(10);
  });
});

// ─── calculateRoyalty ───────────────────────────────────────────────────

describe('calculateRoyalty', () => {
  it('should calculate royalty as 15% of bid', () => {
    expect(calculateRoyalty(100)).toBe(15);
    expect(calculateRoyalty(500)).toBe(75);
    expect(calculateRoyalty(1000)).toBe(150);
  });

  it('should floor the result', () => {
    expect(calculateRoyalty(1)).toBe(0);
    expect(calculateRoyalty(7)).toBe(1);
  });
});

// ─── heuristicScore ─────────────────────────────────────────────────────

describe('heuristicScore (core/agents.js)', () => {
  it('should return 0 for null/undefined/non-string', () => {
    expect(heuristicScore(null)).toBe(0);
    expect(heuristicScore(undefined)).toBe(0);
    expect(heuristicScore(123)).toBe(0);
  });

  it('should return 0 for proposals shorter than 10 chars', () => {
    expect(heuristicScore('short')).toBe(0);
    expect(heuristicScore('Hi there')).toBe(0);
  });

  it('should give length bonus >= 50 chars: 0.25', () => {
    const s = 'Will the Federal Reserve cut interest rates by 25bps in 2026?';
    expect(s.length).toBeGreaterThanOrEqual(50);
    const score = heuristicScore(s);
    expect(score).toBeGreaterThanOrEqual(0.25);
  });

  it('should give length bonus >= 30 chars: 0.15', () => {
    const s = 'Will BTC reach one hundred thousand by 2026?';
    expect(s.length).toBeGreaterThanOrEqual(30);
    const score = heuristicScore(s);
    expect(score).toBeGreaterThanOrEqual(0.15);
  });

  it('should give length bonus >= 20 chars: 0.08', () => {
    const s = 'Will BTC hit 100k USD?';
    expect(s.length).toBeGreaterThanOrEqual(20);
    const score = heuristicScore(s);
    expect(score).toBeGreaterThanOrEqual(0.08);
  });

  it('should penalize proposals over 300 chars', () => {
    const long = 'A'.repeat(301);
    // length bonus for 300+ is: 0.25 - 0.05 = 0.20
    const score = heuristicScore(long);
    // Since there's no other bonuses, should be 0.20
    expect(score).toBeLessThan(0.25);
  });

  it('should reward question format with ?', () => {
    const s = 'Will the Fed cut rates in 2026?';
    const score = heuristicScore(s);
    expect(score).toBeGreaterThanOrEqual(0.15);
  });

  it('should reward Will/Is/Can format even without ?', () => {
    expect(heuristicScore('Will the Fed cut rates')).toBeGreaterThanOrEqual(0.08);
    expect(heuristicScore('Is the market crashing')).toBeGreaterThanOrEqual(0.08);
    expect(heuristicScore('Can BTC reach 100k')).toBeGreaterThanOrEqual(0.08);
  });

  it('should reward date/time specificity', () => {
    const s = 'Will the Fed cut rates by December 2026?';
    const score = heuristicScore(s);
    expect(score).toBeGreaterThan(0.30);
  });

  it('should reward metric/numeric specificity', () => {
    const s = 'Will inflation drop below 2% in 2026?';
    const score = heuristicScore(s);
    expect(score).toBeGreaterThan(0.30);
  });

  it('should reward proper nouns (capitalized acronyms)', () => {
    const s = 'Will the FED raise rates? BTC and ETH responses';
    // FED, BTC, ETH → 3 proper nouns → 0.09
    const score = heuristicScore(s);
    expect(score).toBeGreaterThanOrEqual(0.08);
  });

  it('should reward resolution criterion indicators', () => {
    const s = 'Will the report confirm GDP growth by 2026?';
    const score = heuristicScore(s);
    // "report" and "confirm" are in the resolution pattern list
    expect(score).toBeGreaterThanOrEqual(0.05);
  });

  it('should cap score at 1.0', () => {
    const s = 'Will the Federal Reserve officially announce a 50bps rate cut before December 31, 2026, confirmed by the official report? BTC ETH GDP CPI.';
    const score = heuristicScore(s);
    expect(score).toBeLessThanOrEqual(1.0);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('should floor score at 0', () => {
    // Very long strings with no formatting
    const s = 'aaa ' + 'a'.repeat(400);
    const score = heuristicScore(s);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

// ─── preFilterProposals ─────────────────────────────────────────────────

describe('preFilterProposals (core/agents.js)', () => {
  it('should filter proposals below threshold', () => {
    const proposals = [
      { index: 0, address: '0x111', proposal: 'Bad' },
      { index: 1, address: '0x222', proposal: 'Will BTC reach $100k by end of 2026? Additional details here for scoring.' },
    ];
    const result = preFilterProposals(proposals, 0.25, 10);
    expect(result.length).toBe(1);
    expect(result[0].address).toBe('0x222');
  });

  it('should return top N proposals sorted by hScore', () => {
    const proposals = Array.from({ length: 5 }, (_, i) => ({
      index: i,
      address: `0x${i}`,
      proposal: `Will prediction market question number ${i} resolve by December 2026? With added context.`,
    }));
    const result = preFilterProposals(proposals, 0.20, 3);
    expect(result.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].hScore).toBeGreaterThanOrEqual(result[i].hScore);
    }
  });

  it('should default to threshold=0.25 and maxProposals=10', () => {
    const proposals = [
      { index: 0, address: '0x111', proposal: 'Hi' },
      { index: 1, address: '0x222', proposal: 'Will BTC reach $100k by end of 2026? Additional details here for scoring and context.' },
    ];
    const result = preFilterProposals(proposals);
    expect(result.length).toBeGreaterThanOrEqual(0);
    expect(result.length).toBeLessThanOrEqual(10);
  });
});

// ─── medianScore ────────────────────────────────────────────────────────

describe('medianScore', () => {
  it('should return 0 for empty array', () => {
    expect(medianScore([])).toBe(0);
  });

  it('should return 0 for null/undefined', () => {
    expect(medianScore(null)).toBe(0);
    expect(medianScore(undefined)).toBe(0);
  });

  it('should return the middle value for odd-length arrays', () => {
    expect(medianScore([1, 2, 3])).toBe(2);
    expect(medianScore([0.5, 0.8, 0.9])).toBe(0.8);
  });

  it('should return average of two middle values for even-length arrays', () => {
    expect(medianScore([1, 2, 3, 4])).toBe(2.5);
    expect(medianScore([0.1, 0.5, 0.9, 1.0])).toBe(0.7);
  });

  it('should handle unsorted input', () => {
    expect(medianScore([3, 1, 2])).toBe(2);
  });

  it('should handle single-element array', () => {
    expect(medianScore([0.75])).toBe(0.75);
  });
});

// ─── evaluateProposalWithExpert ─────────────────────────────────────────

describe('evaluateProposalWithExpert', () => {
  it('should return fallback score on API failure (no anthropic client)', async () => {
    const expert = { name: 'Test_Expert', systemPrompt: 'Test' };
    const result = await evaluateProposalWithExpert(expert, 'Some proposal', '0x1234567890', null);
    expect(result).toHaveProperty('expertName', 'Test_Expert');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('reasoning');
  });

  it('should handle anthropic API errors gracefully', async () => {
    const mockAnthropic = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error('API Error')),
      },
    };
    const expert = { name: 'Clarity_Judge', systemPrompt: 'You are a judge.' };
    const result = await evaluateProposalWithExpert(expert, 'Proposal text', '0x1234567890', mockAnthropic);
    expect(result.expertName).toBe('Clarity_Judge');
    expect(result.score).toBe(0.5);
    expect(result.reasoning).toBe('eval failed');
  });
});

// ─── fallbackResponses ──────────────────────────────────────────────────

describe('fallbackResponses', () => {
  it('should provide responses for 4 news items', () => {
    const keys = Object.keys(fallbackResponses).map(Number).sort((a, b) => a - b);
    expect(keys).toEqual([0, 1, 2, 3]);
  });

  it('each news item should have responses for all 3 agents', () => {
    Object.values(fallbackResponses).forEach(newsItem => {
      expect(newsItem[0]).toBeDefined();
      expect(newsItem[1]).toBeDefined();
      expect(newsItem[2]).toBeDefined();
    });
  });

  it('each response should have title, resolution_criteria, confidence_score', () => {
    Object.values(fallbackResponses).forEach(newsItem => {
      Object.values(newsItem).forEach(response => {
        expect(response).toHaveProperty('title');
        expect(response).toHaveProperty('resolution_criteria');
        expect(response).toHaveProperty('confidence_score');
        expect(response.confidence_score).toBeGreaterThan(0);
        expect(response.confidence_score).toBeLessThanOrEqual(1);
      });
    });
  });
});
