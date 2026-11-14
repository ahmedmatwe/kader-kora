// قطع ثابتة فوق كل المشاهد: شريط التريند، العلامة المائية، شريط المصادر، الترجمة.
import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { C, FONT, SAFE, ar, useIn, Num, CHANNEL } from './brand';

export const TrendBar: React.FC<{ text: string }> = ({ text }) => {
  const p = useIn(2);
  return (
    <div style={{ position: 'absolute', top: SAFE.top + 92, right: SAFE.right, left: SAFE.left, display: 'flex', justifyContent: 'flex-start', direction: 'rtl', transform: `translateX(${(1 - p) * 300}px)`, opacity: p }}>
      <div style={{ ...ar, background: C.red, fontWeight: 900, fontSize: 38, padding: '8px 26px', borderRadius: '14px 0 0 14px', whiteSpace: 'nowrap', flexShrink: 0 }}>تريند</div>
      <div style={{ ...ar, background: 'rgba(10,20,48,0.85)', fontWeight: 700, fontSize: 38, padding: '8px 26px', borderRadius: '0 14px 14px 0', border: `2px solid ${C.red}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flexShrink: 1 }}>{text}</div>
    </div>
  );
};

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
/** ثوابت كل فيديو: «كادر كورة» فوق يمين + تاريخ النشر فوق شمال (date = YYYY-MM-DD) */
export const Watermark: React.FC<{ date?: string }> = ({ date }) => {
  const d = (date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return (
    <>
      <div style={{ position: 'absolute', top: SAFE.top, right: SAFE.right, ...ar, fontWeight: 900, fontSize: 42, display: 'flex', gap: 10, alignItems: 'center', direction: 'rtl', textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
        <span style={{ background: C.gold, color: C.navy, borderRadius: 12, padding: '2px 14px', textShadow: 'none' }}>{CHANNEL[0]}</span>
        <span>{CHANNEL[1]}</span>
      </div>
      {d && (
        <div style={{ position: 'absolute', top: SAFE.top + 4, left: SAFE.left, ...ar, fontWeight: 800, fontSize: 34, background: 'rgba(5,10,25,0.72)', border: '2px solid rgba(255,255,255,0.25)', borderRadius: 12, padding: '4px 16px', display: 'flex', gap: 10, direction: 'rtl', alignItems: 'center' }}>
          <Num>{String(+d[3])}</Num><span>{MONTHS[+d[2] - 1]}</span><Num>{d[1]}</Num>
        </div>
      )}
    </>
  );
};

export const SourceStrip: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ position: 'absolute', bottom: 440, left: 60, right: SAFE.right, textAlign: 'right', ...ar, fontSize: 28, fontWeight: 600, color: C.mute }}>{text}</div>
);

export interface Caption { start: number; end: number; text: string }

/** ترجمة محروقة: سطر واحد كبير، كلمة الـ*تمييز* بالدهبي */
export const Captions: React.FC<{ items: Caption[]; fps: number }> = ({ items, fps }) => {
  const f = useCurrentFrame();
  const t = f / fps;
  const c = items.find((x) => t >= x.start && t < x.end);
  if (!c) return null;
  const local = (t - c.start) * fps;
  const pop = interpolate(local, [0, 5], [0.9, 1], { extrapolateRight: 'clamp' });
  const parts = c.text.split(/(\*[^*]+\*)/g).filter(Boolean);
  return (
    <div style={{ position: 'absolute', bottom: 500, left: 60, right: SAFE.right, display: 'flex', justifyContent: 'center' }}>
      <div style={{ ...ar, fontWeight: 900, fontSize: Math.min(54, Math.floor(1500 / Math.max(1, c.text.replace(/\*/g, '').length))), whiteSpace: 'nowrap', lineHeight: 1.3, textAlign: 'center', background: 'rgba(5,10,25,0.72)', padding: '10px 26px', borderRadius: 18, transform: `scale(${pop})` }}>
        {parts.map((p, i) => (p.startsWith('*') ? <span key={i} style={{ color: C.gold }}>{p.slice(1, -1)}</span> : <span key={i}>{p}</span>))}
      </div>
    </div>
  );
};

/** شارة «صورة أرشيفية» / «رسم توضيحي» + الحقوق */
export const PhotoLabel: React.FC<{ label: string; credit: string }> = ({ label, credit }) => (
  <div style={{ position: 'absolute', top: SAFE.top + 175, right: SAFE.right, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
    <div style={{ ...ar, fontSize: 30, fontWeight: 800, background: 'rgba(0,0,0,0.65)', padding: '4px 16px', borderRadius: 10 }}>{label}</div>
    <div style={{ fontFamily: FONT, fontSize: 24, color: '#ddd', background: 'rgba(0,0,0,0.5)', padding: '2px 10px', borderRadius: 8, direction: 'ltr' }}>{credit}</div>
  </div>
);

export { Num };
