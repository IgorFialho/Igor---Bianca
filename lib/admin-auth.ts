import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';

export const ADMIN_AUTH_COOKIE = 'igor_bianca_admin_auth';

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || 'admin123';
}

function getExpectedToken() {
  return createHash('sha256').update(getAdminPassword()).digest('hex');
}

export function createAdminToken() {
  return getExpectedToken();
}

export function validateAdminPassword(inputPassword: string) {
  return inputPassword === getAdminPassword();
}

export function isAdminRequestAuthorized(request: NextRequest) {
  const cookieValue = request.cookies.get(ADMIN_AUTH_COOKIE)?.value;

  if (!cookieValue) {
    return false;
  }

  return cookieValue === getExpectedToken();
}
