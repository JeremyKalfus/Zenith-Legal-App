const STREAM_CHAT_STYLESHEET_ID = 'stream-chat-css';
export const STREAM_CHAT_CSS_URL =
  'https://cdn.jsdelivr.net/npm/stream-chat-react@13.14.0/dist/css/v2/index.css';

export function ensureStreamChatStylesheet(url: string): void {
  if (typeof document === 'undefined') {
    return;
  }

  if (document.getElementById(STREAM_CHAT_STYLESHEET_ID)) {
    return;
  }

  const link = document.createElement('link');
  link.id = STREAM_CHAT_STYLESHEET_ID;
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
