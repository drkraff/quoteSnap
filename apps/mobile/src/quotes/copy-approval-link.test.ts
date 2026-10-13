import {
  COPY_APPROVAL_LINK_ALREADY,
  COPY_APPROVAL_LINK_COPIED,
  COPY_APPROVAL_LINK_NEED_PHONE,
  COPY_APPROVAL_LINK_OFFLINE,
  approvalPhoneOk,
  copyApprovalMessage,
  planAfterApprovalSend,
  planCopyApprovalLink,
} from './copy-approval-link';

describe('planCopyApprovalLink', () => {
  it('copies a link already stored on the phone', () => {
    const plan = planCopyApprovalLink({
      storedUrl: ' https://vela.example/q/abc ',
      serverId: null,
      online: false,
      phone: null,
    });
    expect(plan).toEqual({ action: 'copy', url: 'https://vela.example/q/abc' });
    expect(copyApprovalMessage(plan)).toBe(COPY_APPROVAL_LINK_COPIED);
  });

  it('does not invent a phone or a link while offline', () => {
    expect(approvalPhoneOk('123')).toBe(false);
    expect(approvalPhoneOk('+972501234567')).toBe(true);
    expect(
      planCopyApprovalLink({
        storedUrl: '  ',
        serverId: null,
        online: true,
        phone: '+972501234567',
      }).action,
    ).toBe('need_sync');
    const offline = planCopyApprovalLink({
      serverId: 'srv-1',
      online: false,
      phone: '+972501234567',
    });
    expect(offline.action).toBe('offline');
    expect(copyApprovalMessage(offline)).toBe(COPY_APPROVAL_LINK_OFFLINE);
    const phone = planCopyApprovalLink({
      serverId: 'srv-1',
      online: true,
      phone: '12',
    });
    expect(phone.action).toBe('need_phone');
    expect(copyApprovalMessage(phone)).toBe(COPY_APPROVAL_LINK_NEED_PHONE);
  });

  it('asks the server once when the phone is real and nothing is stored', () => {
    expect(
      planCopyApprovalLink({
        serverId: 'srv-1',
        online: true,
        phone: '0501234567',
      }),
    ).toEqual({ action: 'request' });
  });

  it('says the link cannot be reissued when the snapshot already exists', () => {
    const plan = planAfterApprovalSend({ alreadyIssued: true });
    expect(plan.action).toBe('already_issued');
    expect(copyApprovalMessage(plan)).toBe(COPY_APPROVAL_LINK_ALREADY);
    expect(planAfterApprovalSend({ approvalUrl: 'https://vela.example/q/tok' })).toEqual({
      action: 'copy',
      url: 'https://vela.example/q/tok',
    });
    expect(planAfterApprovalSend({}).action).toBe('failed');
  });
});
