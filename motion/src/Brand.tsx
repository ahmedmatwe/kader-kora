// صور هوية القناة (ستيلز): بروفايل 800×800، بانر يوتيوب 2048×1152، غلاف فيسبوك 1640×624
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, FontFace, FONT, CHANNEL, TAGLINE } from './templates/brand';

const Ball: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="46" fill={C.white} stroke={C.navy} strokeWidth="4" />
    <polygon points="50,30 68,43 61,64 39,64 32,43" fill={C.navy} />
    {[[50, 30, 50, 6], [68, 43, 90, 36], [61, 64, 75, 86], [39, 64, 25, 86], [32, 43, 10, 36]].map(([a, b, c, d], i) => <line key={i} x1={a} y1={b} x2={c} y2={d} stroke={C.navy} strokeWidth="4" />)}
  </svg>
);

export const Logo: React.FC<{ scale?: number; stacked?: boolean }> = ({ scale = 1, stacked }) => (
  <div style={{ display: 'flex', flexDirection: stacked ? 'column' : 'row', alignItems: 'center', gap: 24 * scale, direction: 'rtl' }}>
    <div style={{ position: 'relative', background: C.gold, color: C.navy, fontFamily: FONT, fontWeight: 900, fontSize: 130 * scale, lineHeight: 1.25, padding: `0 ${34 * scale}px`, borderRadius: 30 * scale }}>
      {CHANNEL[0]}
      <div style={{ position: 'absolute', top: -48 * scale, right: -44 * scale }}><Ball size={86 * scale} /></div>
    </div>
    <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 130 * scale, color: C.white, lineHeight: 1.25 }}>{CHANNEL[1]}</div>
  </div>
);

const Bg: React.FC = () => (
  <AbsoluteFill style={{ background: `radial-gradient(110% 90% at 50% 40%, ${C.navy2} 0%, ${C.navy} 75%)` }}>
    <AbsoluteFill style={{ opacity: 0.07, backgroundImage: `linear-gradient(${C.white} 2px, transparent 2px), linear-gradient(90deg, ${C.white} 2px, transparent 2px)`, backgroundSize: '100px 100px' }} />
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '9%', background: C.red }} />
  </AbsoluteFill>
);

export const Profile: React.FC = () => (
  <AbsoluteFill><FontFace /><Bg /><AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: 40 }}><Logo scale={0.95} stacked /></AbsoluteFill></AbsoluteFill>
);

export const Banner: React.FC<{ tagline: string; compact?: boolean }> = ({ tagline, compact }) => (
  <AbsoluteFill><FontFace /><Bg />
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <Logo scale={compact ? 0.8 : 0.9} />
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: compact ? 44 : 50, color: C.mute, direction: 'rtl' }}>{tagline}</div>
    </AbsoluteFill>
  </AbsoluteFill>
);
