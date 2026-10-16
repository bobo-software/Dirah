import type { ReactNode } from 'react';

function Svg({ children, size = 15 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const StatusIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" fill="currentColor" />
  </Svg>
);

export const PriorityIcon = () => (
  <Svg>
    <path d="M5 21V4" />
    <path d="M5 4h11l-2 4 2 4H5" />
  </Svg>
);

export const PeopleIcon = () => (
  <Svg>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </Svg>
);

export const CalendarIcon = () => (
  <Svg>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </Svg>
);

export const GroupIcon = () => (
  <Svg>
    <rect x="4" y="4" width="16" height="6" rx="1.5" />
    <rect x="4" y="14" width="16" height="6" rx="1.5" />
  </Svg>
);

export const TagIcon = () => (
  <Svg>
    <path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9z" />
    <circle cx="8" cy="8" r="1.3" fill="currentColor" />
  </Svg>
);

export const ChevronUpIcon = () => (
  <Svg size={16}>
    <path d="m6 15 6-6 6 6" />
  </Svg>
);

export const ChevronDownIcon = () => (
  <Svg size={16}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const LinkIcon = () => (
  <Svg size={16}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Svg>
);

export const ExpandIcon = () => (
  <Svg size={16}>
    <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
  </Svg>
);

export const CollapseIcon = () => (
  <Svg size={16}>
    <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" />
  </Svg>
);

export const MoreIcon = () => (
  <Svg size={16}>
    <circle cx="5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="19" cy="12" r="1.2" fill="currentColor" />
  </Svg>
);

export const CloseIcon = () => (
  <Svg size={16}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
