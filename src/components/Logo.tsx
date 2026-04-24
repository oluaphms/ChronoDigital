import React from 'react';
import './Logo.css';

export type LogoSize = 'sm' | 'md' | 'lg';

export type LogoProps = {
  size?: LogoSize;
  className?: string;
};

const sizeMap: Record<LogoSize, string> = {
  sm: '140px',
  md: '200px',
  lg: '280px',
};

/**
 * Logo PontoWebDesk - Versão Ultra Premium
 * Glassmorphism, animações fluidas, gradientes, e detalhes refinados
 */
export function Logo({ size = 'md', className = '' }: LogoProps) {
  return (
    <div className={`logo ${className}`.trim()} data-size={size}>
      <svg
        viewBox="0 0 360 130"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: sizeMap[size], height: 'auto' }}
        aria-label="PontoWebDesk"
        className="logo-svg"
      >
        {/* Definições de gradientes e filtros */}
        <defs>
          {/* Gradiente para texto */}
          <linearGradient id="textGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" className="gradient-start" />
            <stop offset="100%" className="gradient-end" />
          </linearGradient>
          
          {/* Glow suave */}
          <filter id="softGlow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Aura/Glow de fundo */}
        <ellipse cx="65" cy="65" rx="60" ry="60" className="aura-bg" />

        {/* Fingerprint com linhas de ridge */}
        <g className="fingerprint-container">
          {/* Círculos concêntricos */}
          <g className="fingerprint-circles">
            <circle cx="65" cy="65" r="55" />
            <circle cx="65" cy="65" r="47" />
            <circle cx="65" cy="65" r="39" />
            <circle cx="65" cy="65" r="31" />
            <circle cx="65" cy="65" r="23" />
            <circle cx="65" cy="65" r="15" />
          </g>
          
          {/* Linhas de ridge horizontais */}
          <g className="fingerprint-ridges">
            <path d="M25,45 Q65,35 105,45" />
            <path d="M20,55 Q65,45 110,55" />
            <path d="M18,65 Q65,55 112,65" />
            <path d="M20,75 Q65,65 110,75" />
            <path d="M25,85 Q65,75 105,85" />
          </g>
        </g>

        {/* Relógio Premium */}
        <g className="clock-container">
          {/* Borda externa com efeito de profundidade */}
          <circle cx="65" cy="65" r="42" className="clock-outer" />
          <circle cx="65" cy="65" r="40" className="clock-border" />
          
          {/* Marcações das horas */}
          <g className="clock-ticks">
            <line x1="65" y1="28" x2="65" y2="32" />
            <line x1="65" y1="98" x2="65" y2="102" />
            <line x1="28" y1="65" x2="32" y2="65" />
            <line x1="98" y1="65" x2="102" y2="65" />
          </g>
          
          {/* Ponteiros elegantes */}
          <line x1="65" y1="65" x2="65" y2="38" className="clock-hand hour" />
          <line x1="65" y1="65" x2="85" y2="72" className="clock-hand minute" />
          
          {/* Centro com destaque */}
          <circle cx="65" cy="65" r="5" className="clock-center" />
          <circle cx="65" cy="65" r="2" className="clock-pin" />
        </g>

        {/* Botão do cronômetro */}
        <g className="chrono-button">
          <rect x="58" y="20" width="14" height="8" rx="3" className="button-base" />
          <rect x="60" y="16" width="10" height="6" rx="2" className="button-top" />
        </g>

        {/* Texto com gradiente */}
        <g className="text-container">
          <text x="135" y="58" className="text-main">
            PONTO
          </text>
          <text x="135" y="90" className="text-sub">
            WEBDESK
          </text>
        </g>

        {/* Linha decorativa sutil */}
        <path d="M135,100 Q245,110 355,95" className="decorative-line" />
      </svg>
    </div>
  );
}
