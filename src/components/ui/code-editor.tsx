import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { StreamLanguage } from '@codemirror/language'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import type { Extension } from '@codemirror/state'
import { useTheme } from '@/theme'

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  path?: string
  className?: string
}

function languageFor(path?: string): Extension[] {
  const ext = (path || '').split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'js':
    case 'mjs':
    case 'ts':
      return [javascript({ typescript: ext === 'ts' })]
    case 'json':
      return [json()]
    case 'sh':
    case 'bash':
      return [StreamLanguage.define(shell)]
    default:
      return []
  }
}

// Syntax-highlighted editor for workspace hooks/scripts/rules. Language is
// picked from the file extension; the editor theme follows the app's scheme.
//
// CodeMirror renders its own DOM with its own baked-in themes, so it can't
// inherit our tokens — it has to be told 'light' or 'dark' explicitly. Reading
// that from the theme context (rather than sniffing the DOM, as this did) also
// makes it reactive: previously the value was computed once at mount against a
// `.dark` class that the app never actually set, so the editor was permanently
// light even in a dark scheme.
export function CodeEditor({ value, onChange, path, className = '' }: CodeEditorProps) {
  const extensions = useMemo(() => languageFor(path), [path])
  const { resolvedScheme } = useTheme()
  const isDark = resolvedScheme === 'dark'

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={isDark ? 'dark' : 'light'}
      className={className}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        bracketMatching: true,
        autocompletion: false,
      }}
    />
  )
}
