export type StaffMessageInboxItem = {
  candidateUserId: string;
  channelId: string;
  channelName: string;
  candidateDisplayName?: string | null;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
};

type ChannelMessageLike = {
  text?: unknown;
  created_at?: unknown;
};

type ChannelLike = {
  id?: unknown;
  data?: {
    name?: unknown;
    last_message_at?: unknown;
  } | null;
  last_message_at?: unknown;
  state?: {
    messages?: unknown;
  } | null;
  countUnread?: unknown;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export function parseCandidateUserIdFromChannelId(channelId: string): string | null {
  if (!channelId.startsWith('candidate-')) {
    return null;
  }

  const candidateUserId = channelId.slice('candidate-'.length).trim();
  return candidateUserId ? candidateUserId : null;
}

function getLastMessage(messagesUnknown: unknown): ChannelMessageLike | null {
  if (!Array.isArray(messagesUnknown) || messagesUnknown.length === 0) {
    return null;
  }

  const lastMessage = messagesUnknown[messagesUnknown.length - 1];
  return asObject(lastMessage) as ChannelMessageLike | null;
}

function getPreviewText(lastMessage: ChannelMessageLike | null): string {
  const text = typeof lastMessage?.text === 'string' ? lastMessage.text.trim() : '';
  return text || 'Attachment or system message';
}

function toIsoString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  return null;
}

function getLastMessageIsoTimestamp(
  channel: ChannelLike,
  lastMessage: ChannelMessageLike | null,
): string | null {
  return (
    toIsoString(lastMessage?.created_at) ??
    toIsoString(channel.last_message_at) ??
    toIsoString(channel.data?.last_message_at)
  );
}

function getUnreadCount(channel: ChannelLike): number {
  if (typeof channel.countUnread !== 'function') {
    return 0;
  }

  const value = channel.countUnread();
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function mapChannelsToStaffInboxItems(channels: unknown[]): StaffMessageInboxItem[] {
  const rows: StaffMessageInboxItem[] = [];

  for (const channelUnknown of channels) {
    const channel = asObject(channelUnknown) as ChannelLike | null;
    if (!channel) {
      continue;
    }

    const channelId = typeof channel.id === 'string' ? channel.id : null;
    if (!channelId) {
      continue;
    }

    const candidateUserId = parseCandidateUserIdFromChannelId(channelId);
    if (!candidateUserId) {
      continue;
    }

    const lastMessage = getLastMessage(channel.state?.messages);
    if (!lastMessage) {
      continue;
    }

    const lastMessageAt = getLastMessageIsoTimestamp(channel, lastMessage);
    if (!lastMessageAt) {
      continue;
    }

    const channelName =
      typeof channel.data?.name === 'string' && channel.data.name.trim()
        ? channel.data.name
        : channelId;

    rows.push({
      candidateUserId,
      channelId,
      channelName,
      lastMessagePreview: getPreviewText(lastMessage),
      lastMessageAt,
      unreadCount: getUnreadCount(channel),
    });
  }

  rows.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  return rows;
}

export function formatRelativeTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const now = new Date();
  const sameDay = now.toDateString() === date.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  if (yesterday.toDateString() === date.toDateString()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
