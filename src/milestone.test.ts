import { describe, expect, it } from 'vitest';
import { describeMilestone } from './milestone';

describe('milestone descriptions', () => {
  it('describes the cloud pipeline milestone', () => {
    expect(describeMilestone(0)).toMatch(/automated tests and deployment/);
  });
  it('describes the first usable authoring milestone', () => {
    expect(describeMilestone(1)).toMatch(/answer keys/);
  });
});
