/**
 * Copy the Phase 6a approval link that POST /quotes/:id/send already
 * returns in dry-run. The server stores only a hash, so a second send
 * cannot mint the URL again. No SMS.
 */

export const COPY_APPROVAL_LINK_LABEL = 'Copy approval link';
export const COPY_APPROVAL_LINK_COPIED = 'Approval link copied';
export const COPY_APPROVAL_LINK_NEED_SYNC =
  'This quote has not synced yet. Connect, then try again.';
export const COPY_APPROVAL_LINK_OFFLINE =
  'Connect to the internet to copy the approval link.';
export const COPY_APPROVAL_LINK_NEED_PHONE =
  'Add a valid customer phone on the draft, then try again.';
export const COPY_APPROVAL_LINK_ALREADY =
  'This quote already has an approval link, but it is not on this phone. The link cannot be created again.';
export const COPY_APPROVAL_LINK_FAILED = 'Could not copy the approval link. Try again.';

export type CopyApprovalPlan =
  | { action: 'copy'; url: string }
  | { action: 'need_sync' }
  | { action: 'offline' }
  | { action: 'need_phone' }
  | { action: 'request' }
  | { action: 'already_issued' }
  | { action: 'failed' };

/** Same phone rule as POST /quotes/:id/send. Does not invent a number. */
export function approvalPhoneOk(phone: string | null | undefined): boolean {
  if (typeof phone !== 'string') return false;
  const trimmed = phone.trim();
  if (trimmed.length === 0 || trimmed.length > 20) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

export function planCopyApprovalLink(input: {
  storedUrl?: string | null;
  serverId?: string | null;
  online: boolean;
  phone: string | null | undefined;
}): CopyApprovalPlan {
  const stored = input.storedUrl?.trim() ?? '';
  if (stored !== '') return { action: 'copy', url: stored };
  const serverId = input.serverId?.trim() ?? '';
  if (serverId === '') return { action: 'need_sync' };
  if (!input.online) return { action: 'offline' };
  if (!approvalPhoneOk(input.phone)) return { action: 'need_phone' };
  return { action: 'request' };
}

export function planAfterApprovalSend(input: {
  approvalUrl?: string | null;
  alreadyIssued?: boolean;
}): CopyApprovalPlan {
  const url = input.approvalUrl?.trim() ?? '';
  if (url !== '') return { action: 'copy', url };
  if (input.alreadyIssued) return { action: 'already_issued' };
  return { action: 'failed' };
}

export function copyApprovalMessage(plan: CopyApprovalPlan): string | null {
  switch (plan.action) {
    case 'copy':
      return COPY_APPROVAL_LINK_COPIED;
    case 'need_sync':
      return COPY_APPROVAL_LINK_NEED_SYNC;
    case 'offline':
      return COPY_APPROVAL_LINK_OFFLINE;
    case 'need_phone':
      return COPY_APPROVAL_LINK_NEED_PHONE;
    case 'already_issued':
      return COPY_APPROVAL_LINK_ALREADY;
    case 'failed':
      return COPY_APPROVAL_LINK_FAILED;
    case 'request':
      return null;
  }
}
