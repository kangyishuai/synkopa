import { Show } from 'solid-js';
import { t } from '../lib/i18n';
import { audioApplyError, audioBusy, audioToast, dismissAudioToast, switchToWasapi } from '../state/audioWatch';
import { ChipBoundary } from '../ui/PanelBoundary';

export function AudioToast() {
  return <Show when={audioToast()}>{status => (
    <div class="audio-toast">
      {/* the message behind an error boundary: a failure says so in one line, × still dismisses it */}
      <ChipBoundary name={t('d.ui.pn.message')}>
      <div class="audio-toast-message" role="status">
        <Show when={status().unavailableOutput} fallback={status().error === 'no output device'
          ? t('d.audio.wasapi.nooutput') : t('d.audio.wasapi.error', { err: status().error ?? '' })}>
          {device => t('d.audio.unavailable', { device: device() })}
        </Show>
        <Show when={audioApplyError()}>{error => <div>{error()}</div>}</Show>
      </div>
      <Show when={status().host === 'asio' || status().host === 'wasapi' && !status().running}>
        <button class="smallbtn primary" disabled={audioBusy()} onClick={() => void switchToWasapi()}>
          {t('d.audio.wasapi')}
        </button>
      </Show>
      </ChipBoundary>
      <button class="ibtn" aria-label={t('d.audio.dismiss')} onClick={dismissAudioToast}>×</button>
    </div>
  )}</Show>;
}
