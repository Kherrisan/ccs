/**
 * Code Editor Component
 * CodeMirror 6 backed JSON/YAML/TOML editor with native selection, copy, undo,
 * syntax highlighting, validation, and sensitive-value masking.
 */

import { useMemo, useState } from 'react';
import CodeMirror, { EditorView, type Extension } from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { StreamLanguage } from '@codemirror/language';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { createTheme } from '@uiw/codemirror-themes';
import { tags as t } from '@lezer/highlight';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { parse as parseToml } from 'smol-toml';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import { isSensitiveKey } from '@/lib/sensitive-keys';
import { AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: 'json' | 'yaml' | 'toml';
  readonly?: boolean;
  /**
   * Retained for API compatibility. CodeMirror always preserves exact text,
   * so this flag is a no-op; callers can pass it without effect.
   */
  exactText?: boolean;
  className?: string;
  minHeight?: string;
  heightMode?: 'content' | 'fill-parent';
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  line?: number;
}

function validateJson(code: string): ValidationResult {
  if (!code.trim()) return { valid: true };
  try {
    JSON.parse(code);
    return { valid: true };
  } catch (e) {
    const message = (e as SyntaxError).message;
    const posMatch = message.match(/position (\d+)/);
    if (posMatch) {
      const pos = parseInt(posMatch[1], 10);
      const lines = code.substring(0, pos).split('\n');
      return { valid: false, error: message, line: lines.length };
    }
    return { valid: false, error: message };
  }
}

function validateToml(code: string): ValidationResult {
  if (!code.trim()) return { valid: true };
  try {
    parseToml(code);
    return { valid: true };
  } catch (error) {
    const message = (error as Error).message;
    const lineMatch = message.match(/line\s+(\d+)/i);
    return {
      valid: false,
      error: message,
      line: lineMatch ? Number.parseInt(lineMatch[1], 10) : undefined,
    };
  }
}

const SENSITIVE_PATTERNS: Record<'json' | 'yaml' | 'toml', RegExp> = {
  json: /"([^"\\]+)"\s*:\s*(?=("[^"\\]*"|true|false|null|-?\d[\d.eE+-]*))/g,
  yaml: /^\s*([A-Za-z0-9_.-]+)\s*:\s*(?=\S)/gm,
  toml: /^\s*([A-Za-z0-9_.-]+)\s*=\s*(?=\S)/gm,
};

function buildSensitiveDecorations(
  view: EditorView,
  language: 'json' | 'yaml' | 'toml'
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const pattern = new RegExp(SENSITIVE_PATTERNS[language].source, 'gm');
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const key = match[1];
      if (!isSensitiveKey(key)) continue;
      const valueStart = from + match.index + match[0].length;
      const line = view.state.doc.lineAt(valueStart);
      const valueEnd = line.to;
      const trimmed = view.state.doc.sliceString(valueStart, valueEnd).replace(/\s+$/, '');
      if (!trimmed) continue;
      builder.add(
        valueStart,
        valueStart + trimmed.length,
        Decoration.mark({ class: 'cm-sensitive-mask' })
      );
    }
  }
  return builder.finish();
}

function makeSensitivePlugin(language: 'json' | 'yaml' | 'toml'): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildSensitiveDecorations(view, language);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildSensitiveDecorations(update.view, language);
        }
      }
    },
    { decorations: (v) => v.decorations }
  );
}

// Visual parity with the previous prism-react-renderer themes. Hex values are
// copied from prism-react-renderer/themes/nightOwl.js and themes/github.js so
// the dashboard appearance does not shift with the editor swap.
//
// Background is left transparent on both themes so the surrounding
// `bg-muted/30` container shows through, matching the old Editor which only
// painted token colors over a transparent textarea.
const prismGithubTheme = createTheme({
  theme: 'light',
  settings: {
    background: 'transparent',
    foreground: '#393A34',
    caret: '#393A34',
    selection: 'rgba(57, 58, 52, 0.18)',
    selectionMatch: 'rgba(57, 58, 52, 0.12)',
    lineHighlight: 'transparent',
    gutterBackground: 'transparent',
    gutterForeground: '#999988',
  },
  styles: [
    { tag: [t.comment, t.lineComment, t.blockComment], color: '#999988', fontStyle: 'italic' },
    { tag: [t.string, t.special(t.string), t.regexp], color: '#e3116c' },
    {
      tag: [t.number, t.bool, t.null, t.atom, t.variableName, t.propertyName, t.url],
      color: '#36acaa',
    },
    { tag: [t.keyword, t.attributeName, t.modifier, t.operatorKeyword], color: '#00a4db' },
    { tag: [t.function(t.variableName), t.labelName], color: '#6f42c1' },
    { tag: [t.tagName, t.heading], color: '#00009f', fontWeight: 'bold' },
    { tag: [t.deleted, t.invalid], color: '#d73a49' },
    { tag: [t.punctuation, t.operator, t.bracket, t.brace, t.separator], color: '#393A34' },
  ],
});

const prismNightOwlTheme = createTheme({
  theme: 'dark',
  settings: {
    background: 'transparent',
    foreground: '#d6deeb',
    caret: '#80a4c2',
    selection: 'rgba(29, 59, 83, 0.99)',
    selectionMatch: 'rgba(35, 77, 112, 0.6)',
    lineHighlight: 'transparent',
    gutterBackground: 'transparent',
    gutterForeground: '#4b6479',
  },
  styles: [
    { tag: [t.comment, t.lineComment, t.blockComment], color: '#637777', fontStyle: 'italic' },
    { tag: [t.string, t.special(t.string), t.url], color: 'rgb(173, 219, 103)' },
    { tag: t.number, color: 'rgb(247, 140, 108)' },
    { tag: [t.bool, t.null, t.atom], color: 'rgb(255, 88, 116)' },
    { tag: [t.keyword, t.modifier, t.operatorKeyword], color: 'rgb(127, 219, 202)' },
    { tag: [t.propertyName, t.attributeName], color: 'rgb(128, 203, 196)' },
    { tag: [t.variableName, t.labelName], color: 'rgb(214, 222, 235)' },
    { tag: t.function(t.variableName), color: 'rgb(130, 170, 255)' },
    { tag: [t.tagName, t.heading], color: 'rgb(127, 219, 202)' },
    {
      tag: [t.bracket, t.punctuation, t.operator, t.brace, t.separator],
      color: 'rgb(199, 146, 234)',
    },
    { tag: [t.className, t.special(t.string)], color: 'rgb(255, 203, 139)' },
    { tag: [t.deleted, t.invalid], color: 'rgba(239, 83, 80, 0.56)' },
  ],
});

const sensitiveMaskTheme = EditorView.baseTheme({
  '.cm-sensitive-mask': {
    filter: 'blur(3px)',
    opacity: '0.7',
    transition: 'filter 200ms ease, opacity 200ms ease',
  },
  '.cm-editor.cm-sensitive-revealed .cm-sensitive-mask': {
    filter: 'none',
    opacity: '1',
  },
});

export function CodeEditor({
  value,
  onChange,
  language = 'json',
  readonly = false,
  exactText: _exactText = false,
  className,
  minHeight = '300px',
  heightMode = 'content',
}: CodeEditorProps) {
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const [isFocused, setIsFocused] = useState(false);
  const [isMasked, setIsMasked] = useState(true);
  const isFillParent = heightMode === 'fill-parent';

  const validation = useMemo<ValidationResult>(() => {
    if (language === 'json') return validateJson(value);
    if (language === 'toml') return validateToml(value);
    return { valid: true };
  }, [value, language]);

  const extensions = useMemo<Extension[]>(() => {
    const langExt =
      language === 'json' ? json() : language === 'yaml' ? yaml() : StreamLanguage.define(toml);
    return [
      langExt,
      EditorView.lineWrapping,
      sensitiveMaskTheme,
      makeSensitivePlugin(language),
      EditorView.theme({
        // Match the previous Prism overlay editor: 0.875rem mono, 1.625
        // line-height, 12px padding, transparent background so the parent
        // `bg-muted/30` shows through.
        '&': {
          fontSize: '0.875rem',
          backgroundColor: 'transparent',
        },
        '&.cm-focused': { outline: 'none' },
        '.cm-content': {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          padding: '12px 0',
          caretColor: 'currentColor',
        },
        '.cm-line': {
          padding: '0 12px',
          lineHeight: '1.625',
        },
        '.cm-scroller': {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          lineHeight: '1.625',
        },
        '.cm-gutters': { display: 'none' },
      }),
    ];
  }, [language]);

  return (
    <div
      className={cn('flex min-h-0 flex-col', isFillParent && 'h-full', className)}
      style={isFillParent ? { height: minHeight === 'auto' ? undefined : minHeight } : undefined}
      data-slot="code-editor-root"
    >
      <div
        className={cn(
          'relative rounded-md border overflow-hidden bg-muted/30',
          isFillParent && 'flex min-h-0 flex-1 flex-col',
          isFocused && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
          readonly && 'opacity-70',
          !validation.valid && 'border-destructive'
        )}
        data-slot="code-editor-surface"
      >
        <div
          className={cn(
            isFillParent ? 'scrollbar-editor min-h-0 flex-1 overflow-hidden' : undefined
          )}
          data-slot={isFillParent ? 'code-editor-viewport' : undefined}
        >
          <CodeMirror
            value={value}
            onChange={readonly ? undefined : onChange}
            readOnly={readonly}
            editable={!readonly}
            theme={isDark ? prismNightOwlTheme : prismGithubTheme}
            extensions={extensions}
            height={isFillParent ? '100%' : undefined}
            minHeight={isFillParent ? undefined : minHeight}
            basicSetup={{
              // Keep visual parity with the previous Prism overlay editor:
              // no gutter, no line numbers, no active-line tint.
              lineNumbers: false,
              foldGutter: false,
              highlightActiveLine: false,
              highlightActiveLineGutter: false,
              autocompletion: false,
              searchKeymap: true,
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={cn(
              'cm-editor-root',
              !isMasked && 'cm-sensitive-revealed',
              isFillParent && 'h-full'
            )}
            data-slot="code-editor-codemirror"
          />
        </div>

        <div className="absolute top-2 right-2 z-20 opacity-50 hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 bg-background/50 hover:bg-background border shadow-sm rounded-full"
            onClick={() => setIsMasked(!isMasked)}
            title={isMasked ? t('codeEditor.revealSensitive') : t('codeEditor.maskSensitive')}
          >
            {isMasked ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2 text-xs">
        {validation.valid ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <CheckCircle2 className="w-3 h-3 text-green-500" />
            {t('codeEditor.valid', { language: language.toUpperCase() })}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-destructive">
            <AlertCircle className="w-3 h-3" />
            {validation.error}
            {validation.line && ` (line ${validation.line})`}
          </span>
        )}
        {readonly && (
          <span className="ml-auto text-muted-foreground">{t('codeEditor.readOnly')}</span>
        )}
      </div>
    </div>
  );
}
