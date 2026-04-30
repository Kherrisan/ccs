import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ANTIGRAVITY_ACK_PHRASE,
  ANTIGRAVITY_ACK_VERSION,
  hasAntigravityRiskAcceptanceFlag,
  isAntigravityResponsibilityBypassEnabled,
  validateAntigravityRiskAcknowledgement,
} from '../../auth/antigravity-responsibility';

describe('antigravity-responsibility', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;
  let originalAgyRiskEnv: string | undefined;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-agy-risk-test-'));
    originalCcsHome = process.env.CCS_HOME;
    originalAgyRiskEnv = process.env.CCS_ACCEPT_AGY_RISK;
    process.env.CCS_HOME = tempHome;
    delete process.env.CCS_ACCEPT_AGY_RISK;
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    if (originalAgyRiskEnv !== undefined) {
      process.env.CCS_ACCEPT_AGY_RISK = originalAgyRiskEnv;
    } else {
      delete process.env.CCS_ACCEPT_AGY_RISK;
    }

    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('accepts a complete acknowledgement payload', () => {
    const result = validateAntigravityRiskAcknowledgement({
      version: ANTIGRAVITY_ACK_VERSION,
      reviewedIssue509: true,
      understandsBanRisk: true,
      acceptsFullResponsibility: true,
      typedPhrase: ANTIGRAVITY_ACK_PHRASE,
    });

    expect(result.valid).toBeTrue();
  });

  it('accepts phrase with extra spacing and lowercase', () => {
    const result = validateAntigravityRiskAcknowledgement({
      version: ANTIGRAVITY_ACK_VERSION,
      reviewedIssue509: true,
      understandsBanRisk: true,
      acceptsFullResponsibility: true,
      typedPhrase: '  i   accept   risk  ',
    });

    expect(result.valid).toBeTrue();
  });

  it('rejects payload when checklist steps are not fully completed', () => {
    const result = validateAntigravityRiskAcknowledgement({
      version: ANTIGRAVITY_ACK_VERSION,
      reviewedIssue509: true,
      understandsBanRisk: false,
      acceptsFullResponsibility: true,
      typedPhrase: ANTIGRAVITY_ACK_PHRASE,
    });

    expect(result.valid).toBeFalse();
    expect(result.error).toContain('checklist');
  });

  it('rejects payload when version is outdated', () => {
    const result = validateAntigravityRiskAcknowledgement({
      version: 'older-version',
      reviewedIssue509: true,
      understandsBanRisk: true,
      acceptsFullResponsibility: true,
      typedPhrase: ANTIGRAVITY_ACK_PHRASE,
    });

    expect(result.valid).toBeFalse();
    expect(result.error).toContain('version');
  });

  it('rejects payload when phrase does not match', () => {
    const result = validateAntigravityRiskAcknowledgement({
      version: ANTIGRAVITY_ACK_VERSION,
      reviewedIssue509: true,
      understandsBanRisk: true,
      acceptsFullResponsibility: true,
      typedPhrase: 'I AGREE',
    });

    expect(result.valid).toBeFalse();
    expect(result.error).toContain('phrase');
  });

  it('detects explicit antigravity acceptance flags', () => {
    expect(hasAntigravityRiskAcceptanceFlag(['--accept-agr-risk'])).toBeTrue();
    expect(hasAntigravityRiskAcceptanceFlag(['--accept-antigravity-risk'])).toBeTrue();
    expect(hasAntigravityRiskAcceptanceFlag(['--auth'])).toBeFalse();
  });

  it('enables bypass when CCS_ACCEPT_AGY_RISK is set', () => {
    process.env.CCS_ACCEPT_AGY_RISK = 'true';
    expect(isAntigravityResponsibilityBypassEnabled()).toBeTrue();
  });

  it('enables bypass when cliproxy safety setting is enabled', () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      `version: 8
cliproxy:
  safety:
    antigravity_ack_bypass: true
`
    );

    expect(isAntigravityResponsibilityBypassEnabled()).toBeTrue();
  });
});
