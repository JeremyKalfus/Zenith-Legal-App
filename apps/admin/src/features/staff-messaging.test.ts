import { describe, expect, it } from 'vitest';
import { mapChannelsToStaffInboxItems, parseCandidateUserIdFromChannelId } from './staff-messaging';

describe('parseCandidateUserIdFromChannelId', () => {
  it('parses candidate channel ids', () => {
    expect(parseCandidateUserIdFromChannelId('candidate-abc123')).toBe('abc123');
  });

  it('rejects non-candidate channel ids', () => {
    expect(parseCandidateUserIdFromChannelId('general-abc123')).toBeNull();
  });
});

describe('mapChannelsToStaffInboxItems', () => {
  it('keeps only candidate channels with at least one message and sorts by recency', () => {
    const channels = [
      {
        id: 'candidate-1',
        data: { name: 'Older · Zenith Legal' },
        state: {
          messages: [{ text: 'Earlier message', created_at: '2026-02-23T10:00:00.000Z' }],
        },
        countUnread: () => 0,
      },
      {
        id: 'candidate-2',
        data: { name: 'Newest · Zenith Legal' },
        state: {
          messages: [{ text: 'Newest message', created_at: '2026-02-24T10:00:00.000Z' }],
        },
        countUnread: () => 2,
      },
      {
        id: 'candidate-3',
        data: { name: 'No Messages · Zenith Legal' },
        state: { messages: [] },
      },
      {
        id: 'team-support',
        state: {
          messages: [{ text: 'Ignore this', created_at: '2026-02-24T11:00:00.000Z' }],
        },
      },
    ];

    expect(mapChannelsToStaffInboxItems(channels as unknown[])).toEqual([
      {
        candidateUserId: '2',
        channelId: 'candidate-2',
        channelName: 'Newest · Zenith Legal',
        lastMessagePreview: 'Newest message',
        lastMessageAt: '2026-02-24T10:00:00.000Z',
        unreadCount: 2,
      },
      {
        candidateUserId: '1',
        channelId: 'candidate-1',
        channelName: 'Older · Zenith Legal',
        lastMessagePreview: 'Earlier message',
        lastMessageAt: '2026-02-23T10:00:00.000Z',
        unreadCount: 0,
      },
    ]);
  });
});
