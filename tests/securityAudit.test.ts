import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSecurityAudit, isPatchedReactRouter7 } from '../scripts/security-audit.mjs';

const routerFinding = {
  severity: 'high',
  via: [{ url: 'https://github.com/advisories/GHSA-qwww-vcr4-c8h2' }],
};
const routerDomFinding = { severity: 'high', via: ['react-router'] };

function lock(router = '7.18.2', routerDom = '7.18.2') {
  return {
    packages: {
      'node_modules/react-router': { version: router },
      'node_modules/react-router-dom': { version: routerDom },
    },
  };
}

test('React Router 7.18.2 is recognized as the patched 7.x release', () => {
  assert.equal(isPatchedReactRouter7('7.18.1'), false);
  assert.equal(isPatchedReactRouter7('7.18.2'), true);
  assert.equal(isPatchedReactRouter7('7.19.0'), true);
  assert.equal(isPatchedReactRouter7('8.3.0'), false);
});

test('known RSC advisory is accepted only for patched non-RSC applications', () => {
  const result = evaluateSecurityAudit(
    { vulnerabilities: { 'react-router': routerFinding, 'react-router-dom': routerDomFinding } },
    { lock: lock(), rscUsage: [] },
  );
  assert.equal(result.posture, 'pass-with-reviewed-exception');
  assert.equal(result.accepted.length, 2);
  assert.equal(result.blocking.length, 0);
});

test('RSC use or an unpatched version keeps the audit blocked', () => {
  const report = { vulnerabilities: { 'react-router': routerFinding, 'react-router-dom': routerDomFinding } };
  assert.equal(
    evaluateSecurityAudit(report, { lock: lock(), rscUsage: ['src/rsc.ts'] }).posture,
    'block',
  );
  assert.equal(
    evaluateSecurityAudit(report, { lock: lock('7.18.1', '7.18.1'), rscUsage: [] }).posture,
    'block',
  );
});

test('all unrelated vulnerabilities remain blocking', () => {
  const result = evaluateSecurityAudit(
    { vulnerabilities: { lodash: { severity: 'high', via: [{ url: 'GHSA-other' }] } } },
    { lock: lock(), rscUsage: [] },
  );
  assert.equal(result.posture, 'block');
  assert.deepEqual(result.blocking.map((item) => item.name), ['lodash']);
});
