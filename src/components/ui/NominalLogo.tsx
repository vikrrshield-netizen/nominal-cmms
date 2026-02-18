// src/components/ui/NominalLogo.tsx
// VIKRR Logo — Shield icon + brand text

import appConfig from '../../appConfig';

interface NominalLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export default function NominalLogo({ size = 'md', showText = true }: NominalLogoProps) {
  const sizes = {
    sm: { icon: 24, text: 'text-base', sub: 'text-[9px]', gap: 'gap-1.5' },
    md: { icon: 32, text: 'text-xl', sub: 'text-[10px]', gap: 'gap-2' },
    lg: { icon: 40, text: 'text-2xl', sub: 'text-xs', gap: 'gap-2.5' },
  };

  const s = sizes[size];

  return (
    <div className={`flex items-center ${s.gap}`}>
      {/* Shield icon */}
      <svg
        width={s.icon}
        height={s.icon}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Shield body */}
        <path
          d="M20 3L6 10v10c0 9.5 6 16.5 14 20 8-3.5 14-10.5 14-20V10L20 3z"
          fill="url(#shield-grad)"
          opacity="0.95"
        />
        {/* Inner shield highlight */}
        <path
          d="M20 7L10 12v8c0 7.2 4.5 12.5 10 15 5.5-2.5 10-7.8 10-15v-8L20 7z"
          fill="url(#shield-inner)"
          opacity="0.4"
        />
        {/* V letter */}
        <path
          d="M14 14l6 12 6-12"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <defs>
          <linearGradient id="shield-grad" x1="6" y1="3" x2="34" y2="33">
            <stop stopColor="#1e3a5f" />
            <stop offset="1" stopColor="#3b82f6" />
          </linearGradient>
          <linearGradient id="shield-inner" x1="10" y1="7" x2="30" y2="35">
            <stop stopColor="#60a5fa" />
            <stop offset="1" stopColor="#1e40af" />
          </linearGradient>
        </defs>
      </svg>

      {/* Text */}
      {showText && (
        <div className="flex flex-col leading-none">
          <span className={`${s.text} font-black tracking-tight text-white`}>
            {appConfig.BRAND_NAME}
          </span>
          <span className={`${s.sub} font-medium tracking-widest uppercase text-blue-400/80`}>
            {appConfig.PRODUCT_NAME_SHORT}
          </span>
        </div>
      )}
    </div>
  );
}
