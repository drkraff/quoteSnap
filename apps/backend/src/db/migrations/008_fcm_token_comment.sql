-- A-19: contractors.fcm_token is reserved for Phase 6 (FAIL-08 / SMS-08).
-- COMMENT only — do not DROP. FCM is not implemented; the API must not write it.

COMMENT ON COLUMN contractors.fcm_token IS
  'Reserved for FAIL-08 / SMS-08 (Phase 6 FCM). Unused until then. Do not SELECT/UPDATE from the API; do not DROP.';
