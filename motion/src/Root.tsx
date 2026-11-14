import React from 'react';
import { Composition, staticFile } from 'remotion';
import { NewsShort, FPS, type Plan } from './NewsShort';
import { Profile, Banner } from './Brand';
import { TAGLINE } from './templates/brand';

const empty: Plan = { duration: 3, audio: '', trend: 'تجربة', sources: '', scenes: [], captions: [] };

export const Root: React.FC = () => (
  <>
  <Composition id="Profile" component={Profile} fps={30} width={800} height={800} durationInFrames={1} />
  <Composition id="YTBanner" component={Banner as any} fps={30} width={2048} height={1152} durationInFrames={1} defaultProps={{ tagline: TAGLINE }} />
  <Composition id="FBCover" component={Banner as any} fps={30} width={1640} height={624} durationInFrames={1} defaultProps={{ tagline: TAGLINE, compact: true }} />
  <Composition
    id="NewsShort"
    component={NewsShort as unknown as React.FC<Record<string, unknown>>}
    fps={FPS} width={1080} height={1920}
    durationInFrames={90}
    defaultProps={empty as unknown as Record<string, unknown>}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.ceil(Number((props as unknown as Plan).duration) * FPS) })}
  />
  </>
);
