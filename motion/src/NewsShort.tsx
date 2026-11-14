// تركيب الفيديو: مشاهد من المكتبة حسب plan.json + صوت + ترجمة + الهوية
import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig, interpolate, useCurrentFrame } from 'remotion';
import { FontFace, FPS } from './templates/brand';
import { TrendBar, Watermark, Captions, SourceStrip, type Caption } from './templates/parts';
import * as S from './templates/scenes';

export interface Scene { type: string; start: number; end: number; [k: string]: unknown }
export interface Plan { duration: number; audio: string; music?: string; trend: string; sources: string; scenes: Scene[]; captions: Caption[] }

const MAP: Record<string, React.FC<any>> = {
  photo: S.PhotoScene, score: S.ScoreScene, versus: S.VersusScene, claim: S.ClaimScene,
  flashback: S.FlashbackScene, subs: S.SubsScene, verdict: S.VerdictScene, end: S.EndScene,
};

const Fade: React.FC<{ frames: number; children: React.ReactNode }> = ({ frames, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 5, frames - 4, frames], [0, 1, 1, 0.6], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

export const NewsShort: React.FC<Plan> = (plan) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: '#0A1430' }}>
      <FontFace />
      {plan.scenes.map((sc, i) => {
        const Comp = MAP[sc.type];
        const from = Math.round(sc.start * fps);
        const frames = Math.max(1, Math.round(sc.end * fps) - from);
        return (
          <Sequence key={i} from={from} durationInFrames={frames}>
            <Fade frames={frames}><Comp {...sc} frames={frames} /></Fade>
          </Sequence>
        );
      })}
      <TrendBar text={plan.trend} />
      <Watermark />
      <SourceStrip text={plan.sources} />
      <Captions items={plan.captions} fps={fps} />
      {plan.audio && <Audio src={staticFile(plan.audio)} />}
      {plan.music && <Audio src={staticFile(plan.music)} volume={(f) => 0.07 * Math.min(1, f / 15, (plan.duration * fps - f) / 36)} />}
    </AbsoluteFill>
  );
};
export { FPS };
