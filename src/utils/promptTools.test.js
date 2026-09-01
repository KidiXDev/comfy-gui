import { describe, expect, test } from 'bun:test';
import {
  adjustPromptWeight,
  estimateClipTokens,
  formatAndCleanPrompt,
  formatTagWeight,
  parsePromptToChips,
  parseTagWeight,
  reconstructPromptFromChips
} from './promptTools';

describe('promptTools', () => {
  test('parses tag weights correctly', () => {
    expect(parseTagWeight('masterpiece')).toEqual({
      text: 'masterpiece',
      weight: 1.0
    });
    expect(parseTagWeight('(masterpiece:1.2)')).toEqual({
      text: 'masterpiece',
      weight: 1.2
    });
    expect(parseTagWeight('(1girl, solo:1.15)')).toEqual({
      text: '1girl, solo',
      weight: 1.15
    });
    expect(parseTagWeight('(solo)')).toEqual({
      text: 'solo',
      weight: 1.1
    });
  });

  test('formats tag weights correctly', () => {
    expect(formatTagWeight('masterpiece', 1.0)).toBe('masterpiece');
    expect(formatTagWeight('masterpiece', 1.2)).toBe('(masterpiece:1.2)');
    expect(formatTagWeight('masterpiece', 0.85)).toBe('(masterpiece:0.85)');
  });

  test('adjusts prompt weight with selected range', () => {
    const text = '1girl, masterpiece, solo';
    const selStart = 7;
    const selEnd = 18;
    const res = adjustPromptWeight(text, selStart, selEnd, 0.1);
    expect(res.text).toBe('1girl, (masterpiece:1.1), solo');

    const res2 = adjustPromptWeight(res.text, res.selectionStart, res.selectionEnd, 0.1);
    expect(res2.text).toBe('1girl, (masterpiece:1.2), solo');

    const res3 = adjustPromptWeight(res2.text, res2.selectionStart, res2.selectionEnd, -0.2);
    expect(res3.text).toBe('1girl, masterpiece, solo');
  });

  test('cleans and formats prompts', () => {
    const dirty = '1girl, , masterpiece  , 1girl, best quality,   solo, ';
    expect(formatAndCleanPrompt(dirty)).toBe(
      '1girl, masterpiece, best quality, solo'
    );
  });

  test('estimates tokens', () => {
    const tokens = estimateClipTokens('1girl, masterpiece, best quality, solo');
    expect(tokens.count).toBeGreaterThan(0);
    expect(tokens.chunks).toBe(1);
  });

  test('chips parsing and reconstruction', () => {
    const prompt = '1girl, (masterpiece:1.2), (solo:0.8)';
    const chips = parsePromptToChips(prompt);
    expect(chips.length).toBe(3);
    expect(chips[0]?.text).toBe('1girl');
    expect(chips[1]?.weight).toBe(1.2);
    expect(chips[2]?.weight).toBe(0.8);

    const reconstructed = reconstructPromptFromChips(chips);
    expect(reconstructed).toBe('1girl, (masterpiece:1.2), (solo:0.8)');
  });
});
