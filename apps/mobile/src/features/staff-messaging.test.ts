import { describe, expect, it } from 'vitest';
import {
  mapChannelsToStaffInboxItems,
  parseCandidateUserIdFromChannelId,
} from './staff-messaging';

describe('parseCandidateUserIdFromChannelId', () => {
  it('extracts the candidate user id from a deterministic channel id', () => {
    expect(parseCandidateUserIdFromChannelId('candidate-abc-123')).toBe('abc-123');
  });

  it('returns null for non-candidate channels', () => {
    expect(parseCandidateUserIdFromChannelId('messaging-general')).toBeNull();
  });
});

describe('mapChannelsToStaffInboxItems', () => {
  it('keeps only candidate channels with at least one message and sorts by recency', () => {
    const rows = mapChannelsToStaffInboxItems([
      {
        id: 'candidate-user-1',
        data: { name: 'Alice · Zenith Legal' },
        state: {
          messages: [{ text: 'Earlier message', created_at: '2026-02-23T10:00:00.000Z' }],
        },
        countUnread: () => 2,
      },
      {
        id: 'candidate-user-2',
        data: { name: 'Bob · Zenith Legal' },
        state: {
          messages: [{ text: 'Newest message', created_at: '2026-02-24T10:00:00.000Z' }],
        },
        countUnread: () => 0,
      },
      {
        id: 'candidate-user-3',
        data: { name: 'No Messages · Zenith Legal' },
        state: { messages: [] },
        countUnread: () => 1,
      },
      {
        id: 'team-staff',
        data: { name: 'Team Staff' },
        state: {
          messages: [{ text: 'Ignore this', created_at: '2026-02-24T11:00:00.000Z' }],
        },
        countUnread: () => 5,
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      candidateUserId: 'user-2',
      channelId: 'candidate-user-2',
      channelName: 'Bob · Zenith Legal',
      lastMessagePreview: 'Newest message',
      unreadCount: 0,
    });
    expect(rows[1]).toMatchObject({
      candidateUserId: 'user-1',
      channelId: 'candidate-user-1',
      unreadCount: 2,
    });
  });
});
