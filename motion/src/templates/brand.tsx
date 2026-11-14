// هوية «كادر كورة» — كل الألوان والخطوط والسرعات في مكان واحد (عدّل هنا بس).
import React from 'react';
import { staticFile, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from 'remotion';

// اسم القناة: [الجزء الدهبي, الجزء الأبيض] — غيّره هنا بس وكل حاجة تتحدث
export const CHANNEL: [string, string] = ['كادر', 'كورة'];
export const TAGLINE = 'كل تريند في الكورة المصرية.. في أقل من دقيقة';

export const FPS = 30;
export const W = 1080;
export const H = 1920;

export const C = {
  navy: '#0A1430',
  navy2: '#13265A',
  red: '#E63946',
  gold: '#FFC93C',
  white: '#FFFFFF',
  mute: '#AAB6D3',
  green: '#2BD576',
};

// المنطقة الآمنة لواجهات تيك توك/ريلز/شورتس: فوق 220، تحت 1480، يمين لحد 900 (أزرار اللايك)
export const SAFE = { top: 220, bottom: 1480, left: 70, right: 180 };

export const FONT = 'CairoLocal';
export const FontFace: React.FC = () => (
  <style>{`@font-face{font-family:${FONT};src:url(${staticFile('fonts/Cairo.ttf')}) format('truetype');font-weight:200 1000;}`}</style>
);

export const ar: React.CSSProperties = { direction: 'rtl', fontFamily: FONT, color: C.white };
// الأرقام دايمًا LTR معزولة عشان الـbidi ما يقلبهاش
export const Num: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <span style={{ direction: 'ltr', unicodeBidi: 'isolate', display: 'inline-block', fontFamily: FONT, fontWeight: 900, ...style }}>{children}</span>
);

/** دخول ناعم (spring) يبدأ بعد delay فريم */
export function useIn(delay = 0, damping = 14) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - delay, fps, config: { damping, mass: 0.7 } });
}
export function useOut(sceneFrames: number, len = 8) {
  const f = useCurrentFrame();
  return interpolate(f, [sceneFrames - len, sceneFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.quad) });
}

/** خلفية الهوية: تدرج كحلي + خطوط شبكة خفيفة متحركة */
export const BrandBg: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 80% at 50% 30%, ${C.navy2} 0%, ${C.navy} 70%)` }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.08, backgroundImage: `linear-gradient(${C.white} 1px, transparent 1px), linear-gradient(90deg, ${C.white} 1px, transparent 1px)`, backgroundSize: '90px 90px', backgroundPosition: `0 ${f * 0.6}px` }} />
    </div>
  );
};
