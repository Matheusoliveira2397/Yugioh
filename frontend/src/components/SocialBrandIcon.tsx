import type { ReactNode, SVGProps } from 'react';
import { useId } from 'react';

export type SocialPlatformKey =
  | 'discord'
  | 'youtube'
  | 'x'
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'twitch'
  | 'linkedin'
  | 'whatsapp'
  | 'telegram'
  | 'reddit'
  | 'github'
  | 'kick'
  | 'threads'
  | 'link';

function normalizeKey(platform: string, url: string): SocialPlatformKey {
  const p = platform.toLowerCase().trim();
  const u = (url || '').toLowerCase();

  const has = (s: string) => p.includes(s) || u.includes(s);

  if (has('discord')) return 'discord';
  if (has('youtube') || has('youtu.be')) return 'youtube';
  if (has('twitter') || p === 'x' || u.includes('twitter.com') || u.includes('x.com')) return 'x';
  if (has('instagram')) return 'instagram';
  if (has('facebook') || has('fb.com')) return 'facebook';
  if (has('tiktok')) return 'tiktok';
  if (has('twitch')) return 'twitch';
  if (has('linkedin')) return 'linkedin';
  if (has('whatsapp') || has('wa.me')) return 'whatsapp';
  if (has('telegram') || u.includes('t.me')) return 'telegram';
  if (has('reddit')) return 'reddit';
  if (has('github')) return 'github';
  if (has('kick.com')) return 'kick';
  if (has('threads')) return 'threads';

  return 'link';
}

export function socialPlatformLabel(platform: string, url: string): string {
  const labels: Record<SocialPlatformKey, string> = {
    discord: 'Discord',
    youtube: 'YouTube',
    x: 'X',
    instagram: 'Instagram',
    facebook: 'Facebook',
    tiktok: 'TikTok',
    twitch: 'Twitch',
    linkedin: 'LinkedIn',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    reddit: 'Reddit',
    github: 'GitHub',
    kick: 'Kick',
    threads: 'Threads',
    link: 'Link',
  };
  return labels[normalizeKey(platform, url)];
}

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function wrap(
  children: ReactNode,
  viewBox: string,
  { size = 24, className, ...rest }: IconProps,
) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      width={size}
      height={size}
      className={className}
      aria-hidden
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Logos com cores oficiais; detecta rede pelo campo `platform` e pela URL. */
export function SocialBrandIcon({
  platform,
  url,
  size = 24,
  className,
}: {
  platform: string;
  url: string;
  size?: number;
  className?: string;
}) {
  const key = normalizeKey(platform, url);
  const gradId = `ig-${useId().replace(/:/g, '')}`;

  switch (key) {
    case 'discord':
      return wrap(
        <path
          fill="#5865F2"
          d="M20.317 4.369A19.791 19.791 0 0 0 16.23 3c-.18.32-.37.74-.5 1.07-1.93-.28-3.84-.28-5.71 0-.14-.33-.32-.75-.51-1.07-1.29.22-2.55.57-3.73 1.07-2.36 3.52-3 6.93-2.68 10.29 1.57 1.15 3.1 1.85 4.6 2.36l1.15-1.5c-.64-.24-1.25-.54-1.82-.9.15-.11.3-.23.44-.35 3.5 1.64 7.31 1.64 10.71 0 .15.12.29.24.44.35-.58.36-1.19.66-1.83.9l1.15 1.5c1.5-.51 3.03-1.2 4.6-2.36.37-3.89-.64-7.27-2.74-10.29zM8.69 13.23c-.93 0-1.7-.82-1.7-1.83s.75-1.83 1.7-1.83 1.72.82 1.7 1.83c0 1-.75 1.83-1.7 1.83zm6.64 0c-.93 0-1.7-.82-1.7-1.83s.75-1.83 1.7-1.83 1.72.82 1.7 1.83c0 1-.75 1.83-1.7 1.83z"
        />,
        '0 0 24 24',
        { size, className },
      );
    case 'youtube':
      return wrap(
        <>
          <path
            fill="#FF0000"
            d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"
          />
          <path fill="#fff" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </>,
        '0 0 24 24',
        { size, className },
      );
    case 'x':
      return wrap(
        <path
          fill="#fff"
          d="M18.901 3h3.18l-6.95 7.93L22.75 21h-6.42l-5.02-6.38L5.12 21H2l7.43-8.5L2.25 3h6.58l4.53 5.77L18.9 3zm-1.12 16.2h1.76L7.28 4.7H5.32L17.78 19.2z"
        />,
        '0 0 24 24',
        { size, className },
      );
    case 'instagram':
      return wrap(
        <>
          <defs>
            <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fd5949" />
              <stop offset="50%" stopColor="#d6249f" />
              <stop offset="100%" stopColor="#285AEB" />
            </linearGradient>
          </defs>
          <path
            fill={`url(#${gradId})`}
            d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2zm0 1.5A4.25 4.25 0 0 0 3.5 7.75v8.5A4.25 4.25 0 0 0 7.75 20.5h8.5a4.25 4.25 0 0 0 4.25-4.25v-8.5A4.25 4.25 0 0 0 16.25 3.5h-8.5zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 1.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm5.25-3.05a1.05 1.05 0 1 1 0 2.1 1.05 1.05 0 0 1 0-2.1z"
          />
        </>,
        '0 0 24 24',
        { size, className },
      );
    case 'facebook':
      return wrap(
        <path
          fill="#1877F2"
          d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.007 1.792-4.669 4.533-4.669 1.313 0 2.686.235 2.686.235v2.953h-1.514c-1.49 0-1.955.926-1.955 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"
        />,
        '0 0 24 24',
        { size, className },
      );
    case 'tiktok':
      return wrap(
        <path
          fill="#fff"
          d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64v-3.5a6.35 6.35 0 0 0-1-.05 6.34 6.34 0 0 0-5.46 9.58 6.34 6.34 0 0 0 10.33-4.91V9.28a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.71z"
        />,
        '0 0 24 24',
        { size, className },
      );
    case 'twitch':
      return wrap(
        <path
          fill="#9146FF"
          d="M11.571 4.714h1.715v5.143H11.57V4.714zm3.857 0H17.14v5.143h-1.714V4.714zM4 1.714 2.286 5.143v12h4.285v2.571h3.428L13.714 17.14H19l3.714-3.714V1.714H4zm14.571 12.858L18 15.143h-4.285l-2.571 2.571V15.143H6.857V3.429h11.714v11.143z"
        />,
        '0 0 24 24',
        { size, className },
      );
    case 'linkedin':
      return wrap(
        <path
          fill="#0A66C2"
          d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.114 20.452H3.558V9h3.556v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
        />,
        '0 0 24 24',
        { size, className },
      );
    case 'whatsapp':
      return wrap(
        <path
          fill="#25D366"
          d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-1.36 1.36-.099.273-.198.471-.148.67.149.297.967 1.732 1.13 2.03.149.297.247.495.049.693-.197.198-.993 1.076-1.334 1.473-.343.396-.693.446-.891.446-.198 0-.396-.049-.594-.049-.198-.099-.743-.273-1.414-.891-.495-.442-.827-.984-.924-1.139-.099-.153-.099-.396.049-.544.049-.049.198-.247.297-.371.099-.123.149-.247.198-.396.05-.149.025-.297-.025-.446-.05-.149-.446-1.076-.612-1.474-.161-.386-.325-.333-.446-.339-.119-.005-.247-.01-.371-.005-.149 0-.396.05-.604.247-.198.198-.767.747-.767 1.822 0 1.076.787 2.116.896 2.267.109.149 1.553 2.382 3.761 3.342 2.209.961 2.209.64 2.606.604.396-.035 1.284-.519 1.465-1.02.18-.501.18-.928.125-1.02-.05-.099-.173-.198-.371-.297zM12.04 2.5c-5.247 0-9.5 4.253-9.5 9.5 0 1.669.434 3.236 1.19 4.598L2.75 21.5l5.083-1.883a9.43 9.43 0 0 0 4.207 1.046c5.247 0 9.5-4.253 9.5-9.5 0-5.247-4.253-9.5-9.5-9.5zm0 1.5c4.419 0 8 3.581 8 8 0 4.419-3.581 8-8 8a7.94 7.94 0 0 1-3.627-.869l-.259-.139-3.018 1.118 1.123-2.941-.172-.27A7.944 7.944 0 0 1 4.04 12c0-4.419 3.581-8 8-8z"
        />,
        '0 0 24 24',
        { size, className },
      );
    case 'telegram':
      return wrap(
        <path
          fill="#26A5E4"
          d="M11.944 20a.81.81 0 0 1-.68-.378L8.5 14.914l-2.928.902a.825.825 0 0 1-.834-1.222l11.47-9.94a.83.83 0 0 1 1.257.898l-3.78 15.308a.822.822 0 0 1-.715.629.81.81 0 0 1-.786-.49l-2.275-4.05-2.74 2.74a.818.818 0 0 1-.381.219zm.4-3.024 1.7-5.47-7.028 4.39 3.62 1.854zm2.38-8.47L6.596 14.1l2.057-.633L22 4.5l-7.276 4.006z"
        />,
        '0 0 24 24',
        { size, className },
      );
    case 'reddit':
      return wrap(
        <path
          fill="#FF4500"
          d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 7.01c.55 0 1 .45 1 1a1 1 0 0 1-1 1 1 1 0 0 1-1-1c0-.55.45-1 1-1zm-11.02 0c.55 0 1 .45 1 1a1 1 0 0 1-1 1 1 1 0 0 1-1-1c0-.55.45-1 1-1zM12 17.5c-2.33 0-4.31-1.46-5.11-3.5h10.22c-.8 2.04-2.78 3.5-5.11 3.5zm7.01-8.45c.57.49.91 1.2.91 1.95 0 1.5-1.2 2.72-2.72 2.72-.46 0-.9-.11-1.28-.32-.77.53-1.72.87-2.74.95v1.9h1.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5h1.5v-1.9c-1.02-.08-1.97-.42-2.74-.95-.38.21-.82.32-1.28.32-1.52 0-2.72-1.22-2.72-2.72 0-.75.34-1.46.91-1.95C6.32 6.95 9.02 5.5 12 5.5c2.98 0 5.68 1.45 7.01 3.55z"
        />,
        '0 0 24 24',
        { size, className },
      );
    case 'github':
      return wrap(
        <path
          fill="#fff"
          fillRule="evenodd"
          d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.483 0-.237-.009-.866-.014-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.465-1.11-1.465-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.252-4.555-1.111-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .268.18.579.688.481C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"
        />,
        '0 0 24 24',
        { size, className },
      );
    case 'kick':
      return wrap(
        <path
          fill="#53FC18"
          d="M3 2h4.5v6.25L12.75 2H18l-5.25 6.25L18 14.75 12.75 14l-5.25-6.25V22H3V2z"
        />,
        '0 0 24 24',
        { size, className },
      );
    case 'threads':
      return wrap(
        <path
          fill="#fff"
          d="M12.186 2c3.2 0 5.794 1.99 6.68 4.99-1.003-.45-2.12-.7-3.31-.7-3.65 0-6.62 2.48-7.44 5.83-.23.96-.23 1.95 0 2.9.82 3.35 3.79 5.83 7.44 5.83 1.19 0 2.31-.25 3.31-.7-.89 3-3.48 4.99-6.68 4.99-4.97 0-9-3.58-9-8s4.03-8 9-8z"
        />,
        '0 0 24 24',
        { size, className },
      );
    default:
      return wrap(
        <path
          fill="#e2e8f0"
          d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"
        />,
        '0 0 24 24',
        { size, className },
      );
  }
}
