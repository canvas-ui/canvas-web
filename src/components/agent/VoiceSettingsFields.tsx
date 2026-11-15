import { Input } from '@/components/ui/input'
import type { VoiceForm } from '@/lib/agent-voice'

interface FieldSpec {
  key: keyof VoiceForm
  label: string
  placeholder: string
  password?: boolean
}

const LISTENING: FieldSpec[] = [
  { key: 'sttUrl', label: 'Server URL', placeholder: 'http://localhost:8000' },
  { key: 'sttModel', label: 'Model', placeholder: 'Systran/faster-whisper-small' },
  { key: 'sttLanguage', label: 'Language', placeholder: 'en, de… (empty detects it)' },
  { key: 'sttKey', label: 'API key', placeholder: 'Only if the server needs one', password: true },
]

const SPEAKING: FieldSpec[] = [
  { key: 'ttsUrl', label: 'Server URL', placeholder: 'http://localhost:8000' },
  { key: 'ttsModel', label: 'Model', placeholder: 'speaches-ai/Kokoro-82M-v1.0-ONNX' },
  { key: 'ttsVoice', label: 'Voice', placeholder: 'af_heart' },
  { key: 'ttsKey', label: 'API key', placeholder: 'Only if the server needs one', password: true },
]

interface VoiceSettingsFieldsProps {
  value: VoiceForm
  onChange: (next: VoiceForm) => void
  disabled?: boolean
}

/** Speech-to-text and text-to-speech settings of one agent. */
export function VoiceSettingsFields({ value, onChange, disabled }: VoiceSettingsFieldsProps) {
  const group = (title: string, fields: FieldSpec[]) => (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map(field => (
          <div key={field.key}>
            <label htmlFor={`voice-${field.key}`} className="text-sm font-medium">{field.label}</label>
            <Input
              id={`voice-${field.key}`}
              className="mt-1"
              type={field.password ? 'password' : 'text'}
              autoComplete="off"
              value={value[field.key]}
              onChange={e => onChange({ ...value, [field.key]: e.target.value })}
              placeholder={field.placeholder}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Any server with the OpenAI audio API works, for example speaches (Whisper and Kokoro in one
        container). An empty field uses the setting shared by this Canvas server.
      </p>
      {group('Listening (speech to text)', LISTENING)}
      {group('Speaking (text to speech)', SPEAKING)}
    </div>
  )
}
