import test from 'node:test';
import assert from 'node:assert/strict';

import { getAdminApprovalEmail } from '../routes/auth.js';

test('uses ADMIN_APPROVAL_EMAIL when set', () => {
  process.env.ADMIN_APPROVAL_EMAIL = 'felipe.van.de.s.araujo@ntnu.no';
  delete process.env.ADMIN_EMAILS;

  assert.equal(getAdminApprovalEmail(), 'felipe.van.de.s.araujo@ntnu.no');
});

test('falls back to ADMIN_EMAILS when approval email is not explicitly set', () => {
  delete process.env.ADMIN_APPROVAL_EMAIL;
  process.env.ADMIN_EMAILS = 'admin@example.com, second@example.com';

  assert.equal(getAdminApprovalEmail(), 'admin@example.com');
});
