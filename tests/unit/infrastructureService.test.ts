import { describe, expect, it } from 'vitest';
import { atlasProcessPath, statusFromLatency, statusFromPercent } from '../../server/services/infrastructureService';

describe('infrastructure thresholds', () => {
  it('classifica pressão de capacidade sem inventar estado para valor ausente', () => {
    expect(statusFromPercent(undefined)).toBe('healthy');
    expect(statusFromPercent(69.9)).toBe('healthy');
    expect(statusFromPercent(70)).toBe('warning');
    expect(statusFromPercent(89.9)).toBe('warning');
    expect(statusFromPercent(90)).toBe('critical');
  });

  it('classifica latência de probes de forma previsível', () => {
    expect(statusFromLatency(undefined)).toBe('unavailable');
    expect(statusFromLatency(249)).toBe('healthy');
    expect(statusFromLatency(250)).toBe('warning');
    expect(statusFromLatency(750)).toBe('critical');
  });

  it('mantém hostname e porta no formato exigido pelo endpoint de medições do Atlas', () => {
    expect(atlasProcessPath('cluster0-shard-00-00.example.mongodb.net', 27017))
      .toBe('cluster0-shard-00-00.example.mongodb.net:27017');
  });
});
