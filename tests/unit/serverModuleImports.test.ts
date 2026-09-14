import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('server-loaded shared modules', () => {
  it('uses Node-compatible extensions in onboarding imports', async () => {
    const source = await readFile(new URL('../../src/lib/onboardingSetup.ts', import.meta.url), 'utf8');

    expect(source).toContain("from './preorderScheduling.js'");
    expect(source).toContain("from './weeklyHours.js'");
  });
});
