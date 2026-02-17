// src/components/ui/NominalLogo.tsx
// Logo Nominal — zelené lístky + text

interface NominalLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export default function NominalLogo({ size = 'md', showText = true }: NominalLogoProps) {
  const sizes = {
    sm: { icon: 24, text: 'text-base', gap: 'gap-1.5' },
    md: { icon: 32, text: 'text-xl', gap: 'gap-2' },
    lg: { icon: 40, text: 'text-2xl', gap: 'gap-2.5' },
  };

  const s = sizes[size];

  return (
    <div className={`flex items-center ${s.gap}`}>
      {/* Leaf icon */}
      <svg
        width={s.icon}
        height={s.icon}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Main leaf */}
        <path
          d="M20 4C12 4 6 10 6 18c0 6 4 12 14 18C30 30 34 24 34 18c0-8-6-14-14-14z"
          fill="url(#leaf-grad)"
          opacity="0.9"
        />
        {/* Leaf vein */}
        <path
          d="M20 10v20M14 14l6 6M26 14l-6 6M14 22l6-4M26 22l-6-4"
          stroke="white"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.5"
        />
        {/* Second smaller leaf */}
        <path
          d="M28 6C24 6 21 9 21 13c0 3 2 6 7 9 5-3 7-6 7-9 0-4-3-7-7-7z"
          fill="url(#leaf-grad2)"
          opacity="0.7"
        />
        <defs>
          <linearGradient id="leaf-grad" x1="6" y1="4" x2="34" y2="36">
            <stop stopColor="#84cc16" />
            <stop offset="1" stopColor="#22c55e" />
          </linearGradient>
          <linearGradient id="leaf-grad2" x1="21" y1="6" x2="35" y2="22">
            <stop stopColor="#a3e635" />
            <stop offset="1" stopColor="#4ade80" />
          </linearGradient>
        </defs>
      </svg>

      {/* Text */}
      {showText && (
        <span className={`${s.text} font-bold tracking-tight`}>
          <span className="text-white">nominal</span>
          <span className="text-orange-500 ml-1">CMMS</span>
        </span>
      )}
    </div>
  );
}
