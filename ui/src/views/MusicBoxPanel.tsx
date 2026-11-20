// Music Box: the modeled tine instrument's page in the channel window. Six knobs: how the
// pluck sounds (brightness, mechanical tick, body resonance) and how it behaves (ring time,
// release, spread). No install step: the DSP is in the program.
import { MB_BODY, MB_BRIGHTNESS, MB_MECHANICAL, MB_RELEASE, MB_RING, MB_SPREAD, type Channel, type MusicBoxState } from '../api/types';
import { clamp } from '../lib/format';
import { t, type TranslationKey } from '../lib/i18n';
import { autoDisplay, isAutomated, paramMenu } from '../state/automation';
import { commit, Gesture, wheelEdit} from '../state/edit';
import { chanById, chanOp } from '../state/pattern';
import { say } from '../state/ui';
import { InstIcon } from '../ui/instIcons';
import { Knob } from '../ui/Knob';

type MbChannel = Extract<Channel, { kind: 'musicbox' }>;
type MbParam = 'ring' | 'brightness' | 'body' | 'mechanical' | 'spread' | 'release';

/** Release knob travel is logarithmic: 40 ms .. 3 s (like Synkopa Keys). */
const relT = (ms: number) => Math.log(ms / MB_RELEASE.min) / Math.log(MB_RELEASE.max / MB_RELEASE.min);
const relMs = (t: number) => Math.round(MB_RELEASE.min * Math.pow(MB_RELEASE.max / MB_RELEASE.min, clamp(t, 0, 1)));
const relText = (ms: number) => (ms >= 1000 ? (ms / 1000).toFixed(2) + ' s' : Math.round(ms) + ' ms');

export function MusicBoxPanel(props: { c: MbChannel }) {
  const live = () => chanById(props.c.id) as MbChannel;
  const wheelKey = (lab: string) => 'mb' + lab + props.c.id;

  // one knob: `tv`/`text` read and show it, `patch` writes the new MusicBoxState
  const knob = (lab: TranslationKey, tv: () => number, text: () => string, patch: (v: number) => MusicBoxState, def: number, param: MbParam) => {
    let g: Gesture | null = null;
    const op = (v: number) => [chanOp(live(), { musicBox: patch(v) } as Partial<Channel>)];
    const target = () => ({ kind: 'musicBox' as const, chanId: props.c.id, param });
    const reset = () => commit(op(def), t('b.mb.gest', { name: t(lab) }));
    return (
      <Knob key={wheelKey(lab)} label={t(lab)} title={t('b.mb.knobTitle', { title: t(lab) })} t={tv} text={text}
        automated={() => isAutomated(target())}
        onMenu={(x, y) => paramMenu(x, y, target(), reset, props.c.color)}
        onStart={() => { g = new Gesture(t('b.mb.gest', { name: t(lab) })); }}
        onChange={v => { g?.update(op(v)); say(props.c.name + ' · ' + t(lab).toLowerCase() + ' ' + text()); }}
        onEnd={() => { g?.end(); g = null; }}
        onReset={reset}
        onWheel={v => wheelEdit(wheelKey(lab), t('b.mb.gest', { name: t(lab) }), op(v))} />
    );
  };

  // the knobs show the automated value while it plays
  const kBase = () => live()?.musicBox ?? props.c.musicBox;
  const at = (param: MbParam) => autoDisplay({ kind: 'musicBox', chanId: props.c.id, param });
  const k = () => ({
    ring: at('ring') ?? kBase().ring,
    brightness: at('brightness') ?? kBase().brightness,
    body: at('body') ?? kBase().body,
    mechanical: at('mechanical') ?? kBase().mechanical,
    spread: at('spread') ?? kBase().spread,
    release: at('release') ?? kBase().release,
  });

  return (
    <div class="keyspanel">
      <div class="keyshd">
        <span class="big" style={{ color: props.c.color }}><InstIcon id="synth" size={34} /></span>
        <div class="keysinfo">
          <div class="nm">MUSIC BOX</div>
          <div class="note">{t('b.mb.desc')}</div>
        </div>
      </div>
      <div class="keysknobs">
        {knob('b.mb.release', () => relT(k().release), () => relText(k().release), t => ({ ...kBase(), release: relMs(t) }), relT(MB_RELEASE.def), 'release')}
        {knob('b.mb.ring', () => (k().ring - MB_RING.min) / (MB_RING.max - MB_RING.min), () => Math.round(k().ring) + ' %', t => ({ ...kBase(), ring: MB_RING.min + Math.round(clamp(t, 0, 1) * (MB_RING.max - MB_RING.min)) }), (MB_RING.def - MB_RING.min) / (MB_RING.max - MB_RING.min), 'ring')}
        {knob('b.mb.brightness', () => k().brightness / 100, () => Math.round(k().brightness) + ' %', t => ({ ...kBase(), brightness: Math.round(clamp(t, 0, 1) * 100) }), MB_BRIGHTNESS.def / 100, 'brightness')}
        {knob('b.mb.body', () => k().body / 100, () => Math.round(k().body) + ' %', t => ({ ...kBase(), body: Math.round(clamp(t, 0, 1) * 100) }), MB_BODY.def / 100, 'body')}
        {knob('b.mb.mechanical', () => k().mechanical / 100, () => Math.round(k().mechanical) + ' %', t => ({ ...kBase(), mechanical: Math.round(clamp(t, 0, 1) * 100) }), MB_MECHANICAL.def / 100, 'mechanical')}
        {knob('b.mb.spread', () => k().spread / 100, () => Math.round(k().spread) + ' %', t => ({ ...kBase(), spread: Math.round(clamp(t, 0, 1) * 100) }), MB_SPREAD.def / 100, 'spread')}
      </div>
    </div>
  );
}
