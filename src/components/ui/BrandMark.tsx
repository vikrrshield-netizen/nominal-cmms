import { useBrandSettings } from '../../hooks/useBrandSettings';

type BrandMarkSize = 'sm' | 'md' | 'lg';
type BrandMarkTone = 'light' | 'dark';

interface BrandMarkProps {
  size?: BrandMarkSize;
  tone?: BrandMarkTone;
  showText?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { box: 'h-9 w-9 rounded-xl text-base', title: 'text-base', subtitle: 'text-[9px]', gap: 'gap-2' },
  md: { box: 'h-12 w-12 rounded-2xl text-xl', title: 'text-xl', subtitle: 'text-[10px]', gap: 'gap-3' },
  lg: { box: 'h-16 w-16 rounded-2xl text-2xl', title: 'text-2xl', subtitle: 'text-xs', gap: 'gap-3' },
} as const;

export default function BrandMark({ size = 'md', tone = 'light', showText = true, className = '' }: BrandMarkProps) {
  const brand = useBrandSettings();
  const s = sizeMap[size];
  const titleColor = tone === 'light' ? 'text-white' : 'text-slate-950';
  const subtitleColor = tone === 'light' ? 'text-blue-300/80' : 'text-slate-500';

  return (
    <div className={`flex items-center ${s.gap} ${className}`}>
      {brand.logoUrl ? (
        <img
          src={brand.logoUrl}
          alt={brand.companyName}
          className={`${s.box} object-contain bg-white p-1 shadow-sm`}
        />
      ) : (
        <div
          className={`${s.box} flex items-center justify-center bg-gradient-to-br from-[#1e3a5f] to-blue-600 font-black text-white shadow-lg shadow-blue-500/20`}
        >
          {brand.logoLetter}
        </div>
      )}
      {showText && (
        <div className="flex min-w-0 flex-col leading-none">
          <span className={`${s.title} ${titleColor} truncate font-black tracking-tight`}>
            {brand.companyName}
          </span>
          <span className={`${s.subtitle} ${subtitleColor} truncate font-bold uppercase tracking-widest`}>
            {brand.productLockup}
          </span>
        </div>
      )}
    </div>
  );
}
