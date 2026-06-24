/**
 * Tests for auction/service.js — Proposal encoding/decoding, heuristic scoring, pre-filtering
 *
 * Covers the core business logic used in the auction phase (phase1.md)
 * and the data flow that feeds into phase2 prediction markets.
 */

import { describe, it, expect } from 'vitest';
import {
  encodeProposal,
  decodeProposal,
  heuristicScore,
  preFilterProposals,
} from '../../backend/auction/service.js';

// ─── encodeProposal / decodeProposal ─────────────────────────────────────

describe('encodeProposal / decodeProposal', () => {
  it('should encode a full proposal into a JSON string', () => {
    const input = {
      question: 'Will BTC reach $100k by 2026?',
      description: 'Bitcoin price prediction',
      options: ['Yes', 'No'],
      resolutionDate: '2026-12-31',
    };
    const encoded = encodeProposal(input);
    const parsed = JSON.parse(encoded);
    expect(parsed.q).toBe(input.question);
    expect(parsed.d).toBe(input.description);
    expect(parsed.o).toEqual(input.options);
    expect(parsed.r).toBe(input.resolutionDate);
  });

  it('should handle missing optional fields with defaults', () => {
    const encoded = encodeProposal({ question: 'Test?' });
    const parsed = JSON.parse(encoded);
    expect(parsed.q).toBe('Test?');
    expect(parsed.d).toBe('');
    expect(parsed.o).toEqual([]);
    expect(parsed.r).toBe('');
  });

  it('should handle empty input gracefully', () => {
    const encoded = encodeProposal({});
    const parsed = JSON.parse(encoded);
    expect(parsed.q).toBe('');
    expect(parsed.o).toEqual([]);
  });

  it('should filter out null/false options', () => {
    const encoded = encodeProposal({
      question: 'Q?',
      options: ['Yes', null, '', 'No'],
    });
    const parsed = JSON.parse(encoded);
    expect(parsed.o).toEqual(['Yes', 'No']);
  });

  it('should decode a valid JSON proposal string', () => {
    const input = JSON.stringify({
      q: 'Will it rain?',
      d: 'Weather forecast',
      o: ['Yes', 'No'],
      r: '2026-07-01',
    });
    const result = decodeProposal(input);
    expect(result.question).toBe('Will it rain?');
    expect(result.description).toBe('Weather forecast');
    expect(result.options).toEqual(['Yes', 'No']);
    expect(result.resolutionDate).toBe('2026-07-01');
  });

  it('should decode a legacy raw string (non-JSON) proposal', () => {
    const result = decodeProposal('Will BTC go up?');
    expect(result.question).toBe('Will BTC go up?');
    expect(result.description).toBe('');
    expect(result.options).toEqual([]);
    expect(result.resolutionDate).toBe('');
  });

  it('should decode an empty string as legacy format', () => {
    const result = decodeProposal('');
    expect(result.question).toBe('');
  });

  it('should round-trip encode → decode faithfully', () => {
    const original = {
      question: 'Will the Fed cut rates in 2026?',
      description: 'Federal Reserve interest rate decision prediction',
      options: ['Yes, by 25bps', 'Yes, by 50bps', 'No cut'],
      resolutionDate: '2026-12-31',
    };
    const encoded = encodeProposal(original);
    const decoded = decodeProposal(encoded);
    expect(decoded.question).toBe(original.question);
    expect(decoded.description).toBe(original.description);
    expect(decoded.options).toEqual(original.options);
    expect(decoded.resolutionDate).toBe(original.resolutionDate);
  });
});

// ─── heuristicScore ─────────────────────────────────────────────────────

describe('heuristicScore (auction/service.js)', () => {
  it('should return 0 for empty/undefined proposals', () => {
    expect(heuristicScore('')).toBe(0);
    expect(heuristicScore('   ')).toBe(0);
    expect(heuristicScore('short')).toBe(0); // < 10 chars
  });

  it('should return 0 for proposal with question shorter than 10 chars', () => {
    const short = JSON.stringify({ q: 'Hi?', d: '', o: [], r: '' });
    expect(heuristicScore(short)).toBe(0);
  });

  it('should give length bonus for questions >= 30 chars', () => {
    const p = JSON.stringify({ q: 'Will BTC reach $100k?', d: '', o: [], r: '' });
    const score = heuristicScore(p);
    expect(score).toBeGreaterThanOrEqual(0.12);
  });

  it('should give length bonus for questions >= 50 chars', () => {
    const p = JSON.stringify({
      q: 'Will the Federal Reserve cut interest rates by 25bps in 2026?',
      d: '', o: [], r: ''
    });
    const score = heuristicScore(p);
    expect(score).toBeGreaterThanOrEqual(0.20);
  });

  it('should award points for question format (ends with ?)', () => {
    const p = JSON.stringify({ q: 'Will the Fed cut rates in 2026?', d: '', o: [], r: '' });
    const score = heuristicScore(p);
    expect(score).toBeGreaterThanOrEqual(0.15);
  });

  it('should award partial points for Will/Is/Can format without question mark', () => {
    const p = JSON.stringify({ q: 'Will the Fed cut rates in 2026', d: '', o: [], r: '' });
    const score = heuristicScore(p);
    expect(score).toBeGreaterThanOrEqual(0.20);
  });

  it('should award points for date presence in resolutionDate', () => {
    const p = JSON.stringify({
      q: 'Will the Fed cut rates?',
      d: '',
      o: ['Yes', 'No'],
      r: '2026-12-31'
    });
    const score = heuristicScore(p);
    expect(score).toBeCloseTo(0.65, 1);
  });

  it('should award points for options count', () => {
    const p = JSON.stringify({
      q: 'Will the Fed cut rates in 2026?',
      d: '',
      o: ['Yes', 'No', 'Hold'],
      r: ''
    });
    const score = heuristicScore(p);
    expect(score).toBeGreaterThanOrEqual(0.47);
  });

  it('should award partial for single option', () => {
    const p = JSON.stringify({
      q: 'Will the Fed cut rates in 2026?',
      d: '',
      o: ['Yes'],
      r: ''
    });
    const score = heuristicScore(p);
    expect(score).toBeGreaterThanOrEqual(0.35);
  });

  it('should award points for description length > 20', () => {
    const p = JSON.stringify({
      q: 'Will the Fed cut rates in 2026?',
      d: 'A prediction about the upcoming Federal Reserve meeting.',
      o: ['Yes', 'No'],
      r: ''
    });
    const score = heuristicScore(p);
    expect(score).toBeGreaterThanOrEqual(0.62);
  });

  it('should cap score at 1.0', () => {
    const p = JSON.stringify({
      q: 'Will the Federal Reserve cut interest rates by 25 basis points in 2026?',
      d: 'A detailed prediction about the upcoming Federal Reserve interest rate decision and its impact on financial markets.',
      o: ['Yes, in Q1', 'Yes, in Q2', 'Yes, in H2', 'No cut'],
      r: '2026-12-31'
    });
    const score = heuristicScore(p);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('should handle JSON with extra whitespace', () => {
    const p = `  {
      "q": "Will BTC hit $100k?",
      "o": ["Yes", "No"],
      "r": "2026-12-31"
    }`;
    const score = heuristicScore(p);
    expect(score).toBeGreaterThan(0);
  });
});

// ─── preFilterProposals ─────────────────────────────────────────────────

describe('preFilterProposals (auction/service.js)', () => {
  const makeProposal = (question) => JSON.stringify({ q: question, d: '', o: [], r: '' });

  it('should return only proposals above threshold', () => {
    const proposals = [
      { index: 0, address: '0x111', proposal: makeProposal('Bad') },
      { index: 1, address: '0x222', proposal: makeProposal('Will BTC reach $100k in 2026? And more details here') },
      { index: 2, address: '0x333', proposal: makeProposal('Will ETH beat BTC?') },
    ];
    const result = preFilterProposals(proposals, 0.20, 50);
    expect(result.length).toBeGreaterThanOrEqual(1);
    result.forEach(p => {
      expect(p.hScore).toBeGreaterThanOrEqual(0.20);
    });
  });

  it('should sort by descending hScore', () => {
    const proposals = [
      { index: 0, address: '0x111', proposal: makeProposal('Will BTC reach $100k in 2026? And more details here for length') },
      { index: 1, address: '0x222', proposal: makeProposal('Will ETH beat BTC?') },
    ];
    const result = preFilterProposals(proposals, 0.10, 50);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].hScore).toBeGreaterThanOrEqual(result[i].hScore);
    }
  });

  it('should respect maxProposals limit', () => {
    const proposals = [];
    for (let i = 0; i < 10; i++) {
      proposals.push({
        index: i,
        address: `0x${i.toString(16).padStart(40, '0')}`,
        proposal: makeProposal(`Will prediction market question number ${i} resolve in 2026?`),
      });
    }
    const result = preFilterProposals(proposals, 0.10, 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('should return empty array if no proposals pass threshold', () => {
    const proposals = [
      { index: 0, address: '0x111', proposal: makeProposal('Bad') },
      { index: 1, address: '0x222', proposal: makeProposal('No') },
    ];
    const result = preFilterProposals(proposals, 0.50, 50);
    expect(result).toEqual([]);
  });

  it('should handle empty proposals array', () => {
    const result = preFilterProposals([], 0.20, 50);
    expect(result).toEqual([]);
  });

  it('should attach hScore to each surviving proposal', () => {
    const proposals = [
      { index: 0, address: '0x111', proposal: makeProposal('Will BTC reach $100k by end of 2026? Additional context.') },
    ];
    const result = preFilterProposals(proposals, 0.20, 50);
    expect(result[0]).toHaveProperty('hScore');
    expect(typeof result[0].hScore).toBe('number');
    expect(result[0].hScore).toBeGreaterThan(0);
  });
});
