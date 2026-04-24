import React from 'react';
import { Logo, type LogoSize } from '../src/components/Logo';

/** Icone legado (PWA, manifest) — nao exibir na UI; marca em SVG: `<Logo />` */
export const BRAND_ICON = '/favicon.ico';
export const BRAND_IMAGE_1024 = '/1024.png';

export type BrandLogoProps = {
  size?: LogoSize;
  className?: string;
  alt?: string;
};

const SIZE_BOX: Record<LogoSize, string> = {
  sm: 'w-auto h-14 flex items-center',
  md: 'w-auto h-18 flex items-center',
  lg: 'w-auto h-24 flex items-center',
};

/**
 * Marca reutilizavel: SVG inline com tema (light/dark) e tamanhos de layout.
 * Design limpo com fingerprint sutil, relogio e texto PONTO/WEBDESK.
 */
export function BrandLogo({ size = 'md', className = '', alt = 'PontoWebDesk' }: BrandLogoProps) {
  return (
    <div className={`${SIZE_BOX[size]} ${className}`.trim()}>
      <Logo size={size} aria-label={alt} className="max-h-full" />
    </div>
  );
}
