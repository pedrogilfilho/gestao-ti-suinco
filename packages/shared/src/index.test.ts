import { describe, it, expect } from 'vitest';
import { VERSAO } from './index.js';

describe('shared', () => {
  it('exporta a versão', () => {
    expect(VERSAO).toBe('0.1.0');
  });
});
