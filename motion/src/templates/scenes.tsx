// مكتبة مشاهد قابلة لإعادة الاستخدام — كل مشهد بياخد props بسيطة ويتحط بين start وend.
import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, Easing } from 'remotion';
import { C, SAFE, ar, Num, useIn, BrandBg } from './brand';
import { PhotoLabel } from './parts';

const Title: React.FC<{ text: string; accent?: string; top?: number; size?: number; delay?: number }> = ({ text, accent, top = SAFE.top + 220, size = 84, delay = 0 }) => {
  const p = useIn(delay);
  const parts = accent ? text.split(accent) : [text];
  return (
    <div style={{ position: 'absolute', top, left: SAFE.left, right: SAFE.right, textAlign: 'center', ...ar, fontWeight: 900, fontSize: size, lineHeight: 1.25, opacity: p, transform: `translateY(${(1 - p) * 40}px)`, textShadow: '0 8px 30px rgba(0,0,0,0.6)' }}>
      {accent ? <>{parts[0]}<span style={{ color: C.gold }}>{accent}</span>{parts[1]}</> : text}
    </div>
  );
};

/** صورة حقيقية بحركة Ken Burns + تعتيم سفلي + شارة أرشيفية */
export const PhotoScene: React.FC<{ src: string; label: string; credit: string; title?: string; accent?: string; zoom?: 'in' | 'out'; focusX?: number; frames: number; badge?: string }> = ({ src, label, credit, title, accent, zoom = 'in', focusX = 50, frames, badge }) => {
  const f = useCurrentFrame();
  const s = interpolate(f, [0, frames], zoom === 'in' ? [1.0, 1.1] : [1.1, 1.0], { easing: Easing.inOut(Easing.quad) });
  const pb = useIn(10);
  return (
    <AbsoluteFill>
      <Img src={staticFile(src)} style={{ position: 'absolute', top: 260, left: 0, width: '100%', height: 1660, objectFit: 'cover', objectPosition: `${focusX}% 0%`, transform: `scale(${s})`, transformOrigin: '40% 25%' }} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(10,20,48,1) 0%, rgba(10,20,48,0.2) 22%, rgba(10,20,48,0) 38%, rgba(10,20,48,0.85) 52%, rgba(10,20,48,0.96) 70%)' }} />
      <PhotoLabel label={label} credit={credit} />
      {title && <Title text={title} accent={accent} top={940} size={86} delay={4} />}
      {badge && (
        <div style={{ position: 'absolute', top: 600, left: SAFE.left, right: SAFE.right, display: 'flex', justifyContent: 'flex-start', direction: 'rtl' }}>
          <div style={{ transform: `scale(${pb}) rotate(${6 * pb}deg)`, background: C.white, color: C.navy, borderRadius: 18, padding: '10px 50px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
            {/[\u0600-\u06FF]/.test(badge) ? <span style={{ ...ar, color: C.navy, fontSize: 104, fontWeight: 900, whiteSpace: 'nowrap' }}>{badge}</span> : <Num style={{ fontSize: 150, color: C.navy }}>{badge}</Num>}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

/** نتيجة ماتش: علمين + نتيجة + سطر فرعي */
export const ScoreScene: React.FC<{ home: string; away: string; hs: number; as: number; sub: string; note?: string }> = ({ home, away, hs, as, sub, note }) => {
  const p = useIn(0); const q = useIn(10); const r = useIn(22);
  const Team: React.FC<{ name: string; color: string }> = ({ name, color }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 170, height: 170, borderRadius: '50%', background: color, border: `6px solid ${C.white}`, boxShadow: '0 10px 40px rgba(0,0,0,0.4)' }} />
      <div style={{ ...ar, fontWeight: 900, fontSize: 60 }}>{name}</div>
    </div>
  );
  return (
    <AbsoluteFill>
      <BrandBg />
      <div style={{ position: 'absolute', top: 560, left: SAFE.left, right: SAFE.right, display: 'flex', direction: 'rtl', justifyContent: 'space-between', alignItems: 'center', opacity: p, transform: `scale(${0.8 + 0.2 * p})` }}>
        <Team name={home} color={C.red} />
        <div style={{ transform: `scale(${q})`, display: 'flex', direction: 'rtl', alignItems: 'center', gap: 30 }}><Num style={{ fontSize: 200, color: C.gold }}>{String(hs)}</Num><Num style={{ fontSize: 120, color: C.white }}>-</Num><Num style={{ fontSize: 200, color: C.gold }}>{String(as)}</Num></div>
        <Team name={away} color="#2E7D32" />
      </div>
      <div style={{ position: 'absolute', top: 940, left: SAFE.left, right: SAFE.right, textAlign: 'center', ...ar, fontSize: 46, fontWeight: 700, opacity: r, whiteSpace: 'pre-line', lineHeight: 1.35 }}>{sub}</div>
      {note && <div style={{ position: 'absolute', top: 1110, left: SAFE.left, right: SAFE.right, textAlign: 'center', ...ar, fontSize: 60, fontWeight: 900, color: C.gold, opacity: useIn(34) }}>{note}</div>}
    </AbsoluteFill>
  );
};

/** مقارنة رقمين (اسم + رقم + وصف) مع عداد */
export const VersusScene: React.FC<{ title: string; a: { name: string; value: number; tag: string }; b: { name: string; value: number; tag: string }; winner?: 'a' | 'b' }> = ({ title, a, b, winner }) => {
  const f = useCurrentFrame();
  const count = (v: number) => Math.round(interpolate(f, [8, 38], [v - 12, v], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) }));
  const Card: React.FC<{ d: typeof a; win: boolean; delay: number }> = ({ d, win, delay }) => {
    const p = useIn(delay);
    return (
      <div style={{ width: 380, padding: '40px 10px', borderRadius: 30, background: win ? C.gold : 'rgba(255,255,255,0.08)', border: `4px solid ${win ? C.gold : C.mute}`, textAlign: 'center', transform: `translateY(${(1 - p) * 80}px)`, opacity: p }}>
        <div style={{ ...ar, fontSize: 52, fontWeight: 900, color: win ? C.navy : C.white }}>{d.name}</div>
        <Num style={{ fontSize: 190, color: win ? C.navy : C.white }}>{String(count(d.value))}</Num>
        <div style={{ ...ar, fontSize: 34, fontWeight: 700, color: win ? C.navy : C.mute }}>{d.tag}</div>
      </div>
    );
  };
  return (
    <AbsoluteFill>
      <BrandBg />
      <Title text={title} top={SAFE.top + 200} size={70} />
      <div style={{ position: 'absolute', top: 560, left: SAFE.left - 20, right: SAFE.right, display: 'flex', direction: 'rtl', justifyContent: 'space-between' }}>
        <Card d={a} win={winner === 'a'} delay={4} />
        <Card d={b} win={winner === 'b'} delay={10} />
      </div>
    </AbsoluteFill>
  );
};

/** رقم واحد كبير بمصدره — بطاقة «مصدر بيقول» */
export const ClaimScene: React.FC<{ who: string; value: string; unit: string; note?: string }> = ({ who, value, unit, note }) => {
  const p = useIn(0); const q = useIn(8, 10);
  return (
    <AbsoluteFill>
      <BrandBg />
      <div style={{ position: 'absolute', top: 470, left: SAFE.left, right: SAFE.right, textAlign: 'center', ...ar, fontSize: 56, fontWeight: 800, opacity: p }}>
        <span style={{ background: 'rgba(255,255,255,0.12)', padding: '8px 26px', borderRadius: 16 }}>{who}</span>
      </div>
      <div style={{ position: 'absolute', top: 600, left: SAFE.left, right: SAFE.right, textAlign: 'center', transform: `scale(${q})` }}>
        <Num style={{ fontSize: 330, color: C.gold, lineHeight: 1 }}>{value}</Num>
        <div style={{ ...ar, fontSize: 64, fontWeight: 900 }}>{unit}</div>
      </div>
      {note && <div style={{ position: 'absolute', top: 1100, left: SAFE.left, right: SAFE.right, textAlign: 'center', ...ar, fontSize: 44, fontWeight: 700, color: C.mute, opacity: useIn(20) }}>{note}</div>}
    </AbsoluteFill>
  );
};

/** رجوع بالزمن: سنة كبيرة + خط زمني + وصف (رسم توضيحي، مفيش صورة) */
export const FlashbackScene: React.FC<{ from_year: number; to_year: number; title: string; detail: string }> = ({ from_year: from, to_year: to, title, detail }) => {
  const f = useCurrentFrame();
  const year = Math.round(interpolate(f, [0, 24], [to, from], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) }));
  const line = interpolate(f, [0, 24], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill>
      <BrandBg />
      <AbsoluteFill style={{ background: 'rgba(120,90,40,0.18)' }} />
      <div style={{ position: 'absolute', top: 470, left: SAFE.left, right: SAFE.right, textAlign: 'center' }}><Num style={{ fontSize: 240, color: C.gold }}>{String(year)}</Num></div>
      <div style={{ position: 'absolute', top: 800, left: 130, right: 240, height: 8, background: 'rgba(255,255,255,0.2)', borderRadius: 4 }}>
        <div style={{ position: 'absolute', right: 0, width: `${line * 100}%`, height: '100%', background: C.gold, borderRadius: 4 }} />
      </div>
      <div style={{ position: 'absolute', top: 830, left: 130, right: 240, display: 'flex', justifyContent: 'space-between' }}>
        <Num style={{ fontSize: 40, color: C.mute }}>{String(from)}</Num><Num style={{ fontSize: 40, color: C.mute }}>{String(to)}</Num>
      </div>
      <Title text={title} top={930} size={72} delay={12} />
      <div style={{ position: 'absolute', top: 1060, left: SAFE.left, right: SAFE.right, textAlign: 'center', ...ar, fontSize: 44, fontWeight: 700, color: C.mute, opacity: useIn(20) }}>{detail}</div>
    </AbsoluteFill>
  );
};

/** عدّاد تغييرات: أسهم تبديل بتظهر واحد ورا التاني لحد count */
export const SubsScene: React.FC<{ count: number; title: string; note: string }> = ({ count, title, note }) => {
  const f = useCurrentFrame();
  const shown = Math.min(count, Math.floor(f / 3));
  return (
    <AbsoluteFill>
      <BrandBg />
      <Title text={title} top={SAFE.top + 200} size={68} />
      <div style={{ position: 'absolute', top: 560, left: 130, right: 240, display: 'flex', flexWrap: 'wrap', direction: 'rtl', gap: 22, justifyContent: 'center' }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} style={{ width: 120, height: 120, borderRadius: 22, background: i < shown ? 'rgba(255,255,255,0.12)' : 'transparent', border: `3px solid ${i < shown ? C.white : 'transparent'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, transform: `scale(${i < shown ? 1 : 0.4})`, opacity: i < shown ? 1 : 0 }}>
            <span style={{ color: C.green }}>▲</span><span style={{ color: C.red }}>▼</span>
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', top: 840, left: SAFE.left, right: SAFE.right, textAlign: 'center', direction: 'rtl' }}><Num style={{ fontSize: 150, color: C.gold, lineHeight: 1.1 }}>{String(shown)}</Num><span style={{ ...ar, fontSize: 64, fontWeight: 900, marginRight: 20 }}>تغييرات</span></div>
      <div style={{ position: 'absolute', top: 1090, left: SAFE.left, right: SAFE.right, textAlign: 'center', ...ar, fontSize: 40, fontWeight: 700, color: C.mute, opacity: useIn(30), whiteSpace: 'pre-line', lineHeight: 1.4 }}>{note}</div>
    </AbsoluteFill>
  );
};

/** الحكم: فرعين «لو… ← …» */
export const VerdictScene: React.FC<{ title: string; yes: { cond: string; res: string; n: string }; no: { cond: string; res: string; n: string }; noDelay?: number }> = ({ title, yes, no, noDelay = 40 }) => {
  const Row: React.FC<{ d: typeof yes; color: string; delay: number }> = ({ d, color, delay }) => {
    const p = useIn(delay);
    return (
      <div style={{ display: 'flex', direction: 'rtl', alignItems: 'center', gap: 24, background: 'rgba(255,255,255,0.07)', borderRight: `14px solid ${color}`, borderRadius: 24, padding: '26px 30px', opacity: p, transform: `translateX(${(1 - p) * -120}px)` }}>
        <Num style={{ fontSize: 120, color }}>{d.n}</Num>
        <div>
          <div style={{ ...ar, fontSize: 40, fontWeight: 700, color: C.mute }}>{d.cond}</div>
          <div style={{ ...ar, fontSize: 52, fontWeight: 900 }}>{d.res}</div>
        </div>
      </div>
    );
  };
  return (
    <AbsoluteFill>
      <BrandBg />
      <Title text={title} top={SAFE.top + 200} size={70} />
      <div style={{ position: 'absolute', top: 540, left: SAFE.left, right: SAFE.right, display: 'flex', flexDirection: 'column', gap: 40 }}>
        <Row d={yes} color={C.gold} delay={4} />
        <Row d={no} color={C.mute} delay={noDelay} />
      </div>
    </AbsoluteFill>
  );
};

/** الخاتمة: الماتش الجاي + سؤال الكومنتات */
export const EndScene: React.FC<{ next?: string; when?: string; cta: string }> = ({ next, when, cta }) => {
  const p = useIn(0); const q = useIn(26);
  return (
    <AbsoluteFill>
      <BrandBg />
      <div style={{ position: 'absolute', top: 480, left: SAFE.left, right: SAFE.right, textAlign: 'center', opacity: p, transform: `scale(${0.8 + 0.2 * p})` }}>
        {next && <div style={{ ...ar, fontSize: 46, fontWeight: 700, color: C.mute }}>الماتش الجاي</div>}
        <div style={{ ...ar, fontSize: 84, fontWeight: 900 }}>{next}</div>
        <div style={{ ...ar, fontSize: 56, fontWeight: 800, color: C.gold }}>{when}</div>
      </div>
      <div style={{ position: 'absolute', top: 930, left: SAFE.left, right: SAFE.right, textAlign: 'center', opacity: q }}>
        <div style={{ display: 'inline-block', ...ar, fontSize: 56, fontWeight: 900, background: C.red, padding: '18px 36px', borderRadius: 24 }}>{cta}</div>
      </div>
    </AbsoluteFill>
  );
};

/** تصريح: مين قال + الجملة بين علامات تنصيص (من الجرايد بس) */
export const QuoteScene: React.FC<{ who: string; role?: string; text: string; src?: string }> = ({ who, role, text, src }) => {
  const p = useIn(0); const q = useIn(10);
  return (
    <AbsoluteFill>
      <BrandBg />
      <div style={{ position: 'absolute', top: 470, left: SAFE.left, right: SAFE.right, textAlign: 'center', opacity: p }}>
        <div style={{ ...ar, fontSize: 64, fontWeight: 900 }}>{who}</div>
        {role && <div style={{ ...ar, fontSize: 40, fontWeight: 700, color: C.mute }}>{role}</div>}
      </div>
      <div style={{ position: 'absolute', top: 700, left: SAFE.left, right: SAFE.right, display: 'flex', justifyContent: 'center', opacity: q, transform: `translateY(${(1 - q) * 30}px)` }}>
        <div style={{ ...ar, fontSize: 58, fontWeight: 800, lineHeight: 1.45, textAlign: 'center', background: 'rgba(255,255,255,0.08)', borderRight: `10px solid ${C.gold}`, borderRadius: 24, padding: '34px 40px' }}>
          <span style={{ color: C.gold, fontSize: 90, lineHeight: 0 }}>«</span>{text}<span style={{ color: C.gold, fontSize: 90, lineHeight: 0 }}>»</span>
        </div>
      </div>
      {src && <div style={{ position: 'absolute', top: 1180, left: SAFE.left, right: SAFE.right, textAlign: 'center', ...ar, fontSize: 36, fontWeight: 700, color: C.mute, opacity: useIn(24) }}>{src}</div>}
    </AbsoluteFill>
  );
};

/** رقم كبير بيعد لحد قيمته + وصفه */
export const StatScene: React.FC<{ value: number; prefix?: string; suffix?: string; label: string; note?: string; frames: number }> = ({ value, prefix = '', suffix = '', label, note, frames }) => {
  const f = useCurrentFrame(); const p = useIn(0);
  const n = Math.round(interpolate(f, [4, Math.min(40, frames * 0.5)], [0, value], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) }));
  return (
    <AbsoluteFill>
      <BrandBg />
      <div style={{ position: 'absolute', top: 540, left: SAFE.left, right: SAFE.right, textAlign: 'center', opacity: p, direction: 'rtl' }}>
        <Num style={{ fontSize: 300, color: C.gold, lineHeight: 1 }}>{`${prefix}${n}${suffix}`}</Num>
      </div>
      <div style={{ position: 'absolute', top: 900, left: SAFE.left, right: SAFE.right, textAlign: 'center', ...ar, fontSize: 66, fontWeight: 900, opacity: useIn(10) }}>{label}</div>
      {note && <div style={{ position: 'absolute', top: 1060, left: SAFE.left, right: SAFE.right, textAlign: 'center', ...ar, fontSize: 42, fontWeight: 700, color: C.mute, opacity: useIn(24), whiteSpace: 'pre-line' }}>{note}</div>}
    </AbsoluteFill>
  );
};

/** 2-4 نقاط بتظهر ورا بعض */
export const ListScene: React.FC<{ title: string; items: string[]; frames: number }> = ({ title, items, frames }) => {
  const step = Math.max(8, Math.min(24, Math.floor((frames - 20) / Math.max(1, items.length))));
  return (
    <AbsoluteFill>
      <BrandBg />
      <Title text={title} top={460} size={70} />
      <div style={{ position: 'absolute', top: 650, left: SAFE.left, right: SAFE.right, display: 'flex', flexDirection: 'column', gap: 30 }}>
        {items.slice(0, 4).map((t, i) => <ListRow key={i} text={t} n={i + 1} delay={10 + i * step} />)}
      </div>
    </AbsoluteFill>
  );
};
const ListRow: React.FC<{ text: string; n: number; delay: number }> = ({ text, n, delay }) => {
  const p = useIn(delay);
  return (
    <div style={{ display: 'flex', direction: 'rtl', alignItems: 'center', gap: 24, opacity: p, transform: `translateX(${(1 - p) * -80}px)` }}>
      <div style={{ minWidth: 72, height: 72, borderRadius: 36, background: C.red, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="44" height="44" viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
      <div style={{ ...ar, fontSize: 50, fontWeight: 800, lineHeight: 1.3, background: 'rgba(255,255,255,0.08)', borderRadius: 18, padding: '14px 26px', flex: 1 }}>{text}</div>
    </div>
  );
};

/** عنوان كبير (خبر عاجل/مفاجأة) + سطر شرح */
export const HeadlineScene: React.FC<{ kicker?: string; title: string; accent?: string; sub?: string }> = ({ kicker, title, accent, sub }) => {
  const p = useIn(0);
  return (
    <AbsoluteFill>
      <BrandBg />
      {kicker && <div style={{ position: 'absolute', top: 500, left: SAFE.left, right: SAFE.right, textAlign: 'center', opacity: p }}><span style={{ ...ar, fontSize: 46, fontWeight: 900, background: C.red, padding: '8px 28px', borderRadius: 14 }}>{kicker}</span></div>}
      <Title text={title} accent={accent} top={640} size={92} delay={4} />
      {sub && <div style={{ position: 'absolute', top: 1040, left: SAFE.left, right: SAFE.right, textAlign: 'center', ...ar, fontSize: 46, fontWeight: 700, color: C.mute, opacity: useIn(18), whiteSpace: 'pre-line', lineHeight: 1.4 }}>{sub}</div>}
    </AbsoluteFill>
  );
};
