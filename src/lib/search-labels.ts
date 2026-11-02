/**
 * Plain-language names for the search pipeline's machine keys.
 *
 * Config, routes and logs keep the ids (`text`, `image`, `clip`, `onnx`, …);
 * the UI leads with these labels and shows the id as secondary text, so people
 * who do know the model names can still map one onto the other.
 */

const SPACE_LABELS: Record<string, { label: string; hint: string }> = {
  text: {
    label: 'Text & documents',
    hint: 'Notes, emails, documents and text files',
  },
  image: {
    label: 'Photos & images',
    hint: 'Images, matched against what you type: "red bike in the snow" finds the photo',
  },
}

const PROVIDER_LABELS: Record<string, string> = {
  onnx: 'Built-in text model',
  clip: 'Built-in image model',
  blip: 'Built-in image describer',
  ollama: 'Ollama on this server',
  vllm: 'vLLM on this server',
  openai: 'OpenAI',
}

const PROVIDER_TYPE_LABELS: Record<string, string> = {
  onnx: 'Built-in, text',
  clip: 'Built-in, images',
  blip: 'Built-in, image descriptions',
  openai: 'OpenAI-compatible server',
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

/** "text" → "Text & documents"; unknown spaces are just capitalized. */
export function spaceLabel(space: string): string {
  return SPACE_LABELS[space]?.label ?? capitalize(space)
}

/** One line on what a space covers, or null for spaces we know nothing about. */
export function spaceHint(space: string): string | null {
  return SPACE_LABELS[space]?.hint ?? null
}

/** "clip" → "Built-in image model"; a user-named provider keeps its own name. */
export function providerLabel(id: string): string {
  return PROVIDER_LABELS[id] ?? id
}

/** Provider type as a reader would describe it ("openai" → "OpenAI-compatible server"). */
export function providerTypeLabel(type: string): string {
  return PROVIDER_TYPE_LABELS[type] ?? type
}
