import BrandMark from './BrandMark';

interface NominalLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export default function NominalLogo({ size = 'md', showText = true }: NominalLogoProps) {
  return <BrandMark size={size} showText={showText} tone="light" />;
}
