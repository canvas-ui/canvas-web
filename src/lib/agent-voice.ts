import type { AgentVoiceConfig } from '@/services/agent'

export interface VoiceForm {
  sttUrl: string
  sttKey: string
  sttModel: string
  sttLanguage: string
  ttsUrl: string
  ttsKey: string
  ttsModel: string
  ttsVoice: string
}

export const EMPTY_VOICE_FORM: VoiceForm = {
  sttUrl: '', sttKey: '', sttModel: '', sttLanguage: '',
  ttsUrl: '', ttsKey: '', ttsModel: '', ttsVoice: '',
}

export function voiceFormFromConfig(voice: AgentVoiceConfig | undefined): VoiceForm {
  return {
    sttUrl: voice?.stt?.baseUrl || '',
    sttKey: voice?.stt?.apiKey || '',
    sttModel: voice?.stt?.model || '',
    sttLanguage: voice?.stt?.language || '',
    ttsUrl: voice?.tts?.baseUrl || '',
    ttsKey: voice?.tts?.apiKey || '',
    ttsModel: voice?.tts?.model || '',
    ttsVoice: voice?.tts?.voice || '',
  }
}

/** The complete voice config for a form; the server replaces the stored one with it. */
export function voiceConfigFromForm(form: VoiceForm): AgentVoiceConfig {
  const filled = (fields: Record<string, string>) =>
    Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value))
  return {
    stt: filled({ baseUrl: form.sttUrl, apiKey: form.sttKey, model: form.sttModel, language: form.sttLanguage }),
    tts: filled({ baseUrl: form.ttsUrl, apiKey: form.ttsKey, model: form.ttsModel, voice: form.ttsVoice }),
  }
}
