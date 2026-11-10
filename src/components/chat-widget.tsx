import Script from 'next/script';
import cfg from '@/lib/chat-widget.json';

/** 외부 챗봇(지원봇) 위젯. 지식 문서로 답하는 봇을 화면 오른쪽 아래에 띄운다. src가 비어 있으면 아무것도 안 띄운다. */
export function ChatWidget(): React.ReactElement | null {
  if (!cfg.src) return null;
  return <Script src={cfg.src} strategy="afterInteractive" data-slug={cfg.slug} data-title={cfg.title} data-color={cfg.color} data-greeting={cfg.greeting} data-greeting-delay={String(cfg.greeting_delay)} data-position={cfg.position} data-offset={String(cfg.offset)} />;
}
