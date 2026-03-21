import { useRef, useEffect, useCallback, type ReactNode } from 'react';
import './LoginBroadcastRichEditor.css';

type Props = {
  value: string;
  onChange: (html: string) => void;
  readOnly?: boolean;
  placeholder?: string;
};

/** Texto visível mínimo (sem tags / só BR). */
export function isLoginBroadcastBodyEmpty(html: string): boolean {
  const stripped = html
    .replace(/<p><br\s*\/?><\/p>/gi, ' ')
    .replace(/<p>\s*<\/p>/gi, ' ')
    .replace(/<div><br\s*\/?><\/div>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();
  return stripped.length === 0;
}

function run(cmd: string, val?: string) {
  try {
    document.execCommand(cmd, false, val);
  } catch {
    /* ignore */
  }
}

function TbButton({
  title,
  onClick,
  children,
  disabled,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      className="lb-tb-btn"
    >
      {children}
    </button>
  );
}

export default function LoginBroadcastRichEditor({ value, onChange, readOnly, placeholder }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const lastValueRef = useRef(value);

  const emitHtml = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    lastValueRef.current = html;
    onChange(html);
  }, [onChange]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value === lastValueRef.current) return;
    syncingRef.current = true;
    el.innerHTML = value || '';
    lastValueRef.current = value || '';
    syncingRef.current = false;
  }, [value]);

  const focusEditor = () => editorRef.current?.focus();

  const askUrl = (label: string) => {
    const u = window.prompt(label);
    return u?.trim() || '';
  };

  const insertLink = () => {
    focusEditor();
    const url = askUrl('URL do link (https://...)');
    if (url) run('createLink', url);
    emitHtml();
  };

  const insertImage = () => {
    focusEditor();
    const url = askUrl('URL da imagem (cartão, banner, etc.)');
    if (url) run('insertImage', url);
    emitHtml();
  };

  const setHeading = (tag: 'p' | 'h1' | 'h2' | 'h3') => {
    focusEditor();
    run('formatBlock', tag);
    emitHtml();
  };

  const pickColor = () => {
    focusEditor();
    const c = askUrl('Cor do texto (ex.: #e2e8f0 ou red)');
    if (c) run('foreColor', c);
    emitHtml();
  };

  const pickHighlight = () => {
    focusEditor();
    const c = askUrl('Cor de fundo do texto (ex.: #4f46e5)');
    if (c) run('hiliteColor', c);
    emitHtml();
  };

  return (
    <div className={`login-broadcast-rich-editor ${readOnly ? 'login-broadcast-rich-editor--readonly' : ''}`}>
      <div className="lb-toolbar" aria-label="Formatação" onMouseDown={(e) => e.preventDefault()}>
        <TbButton title="Normal (parágrafo)" disabled={readOnly} onClick={() => setHeading('p')}>
          ¶
        </TbButton>
        <TbButton title="Título 1" disabled={readOnly} onClick={() => setHeading('h1')}>
          H1
        </TbButton>
        <TbButton title="Título 2" disabled={readOnly} onClick={() => setHeading('h2')}>
          H2
        </TbButton>
        <TbButton title="Título 3" disabled={readOnly} onClick={() => setHeading('h3')}>
          H3
        </TbButton>
        <span className="lb-toolbar-sep" />
        <TbButton title="Negrito" disabled={readOnly} onClick={() => { focusEditor(); run('bold'); emitHtml(); }}>
          <strong>B</strong>
        </TbButton>
        <TbButton title="Itálico" disabled={readOnly} onClick={() => { focusEditor(); run('italic'); emitHtml(); }}>
          <em>I</em>
        </TbButton>
        <TbButton title="Sublinhado" disabled={readOnly} onClick={() => { focusEditor(); run('underline'); emitHtml(); }}>
          <u>U</u>
        </TbButton>
        <TbButton title="Riscado" disabled={readOnly} onClick={() => { focusEditor(); run('strikeThrough'); emitHtml(); }}>
          <s>S</s>
        </TbButton>
        <span className="lb-toolbar-sep" />
        <TbButton title="Lista com marcadores" disabled={readOnly} onClick={() => { focusEditor(); run('insertUnorderedList'); emitHtml(); }}>
          • Lista
        </TbButton>
        <TbButton title="Lista numerada" disabled={readOnly} onClick={() => { focusEditor(); run('insertOrderedList'); emitHtml(); }}>
          1. Lista
        </TbButton>
        <TbButton title="Recuo" disabled={readOnly} onClick={() => { focusEditor(); run('indent'); emitHtml(); }}>
          →
        </TbButton>
        <TbButton title="Diminuir recuo" disabled={readOnly} onClick={() => { focusEditor(); run('outdent'); emitHtml(); }}>
          ←
        </TbButton>
        <span className="lb-toolbar-sep" />
        <TbButton title="Alinhar à esquerda" disabled={readOnly} onClick={() => { focusEditor(); run('justifyLeft'); emitHtml(); }}>
          ⬅
        </TbButton>
        <TbButton title="Centralizar" disabled={readOnly} onClick={() => { focusEditor(); run('justifyCenter'); emitHtml(); }}>
          ⬛
        </TbButton>
        <TbButton title="Alinhar à direita" disabled={readOnly} onClick={() => { focusEditor(); run('justifyRight'); emitHtml(); }}>
          ➡
        </TbButton>
        <span className="lb-toolbar-sep" />
        <TbButton title="Cor do texto (digite HEX ou nome)" disabled={readOnly} onClick={pickColor}>
          A
        </TbButton>
        <TbButton title="Realce / fundo do texto" disabled={readOnly} onClick={pickHighlight}>
          ■
        </TbButton>
        <TbButton title="Subscrito" disabled={readOnly} onClick={() => { focusEditor(); run('subscript'); emitHtml(); }}>
          X₂
        </TbButton>
        <TbButton title="Sobrescrito" disabled={readOnly} onClick={() => { focusEditor(); run('superscript'); emitHtml(); }}>
          X²
        </TbButton>
        <span className="lb-toolbar-sep" />
        <TbButton title="Citação" disabled={readOnly} onClick={() => { focusEditor(); run('formatBlock', 'blockquote'); emitHtml(); }}>
          ❝
        </TbButton>
        <TbButton title="Inserir link" disabled={readOnly} onClick={insertLink}>
          🔗
        </TbButton>
        <TbButton title="Inserir imagem (URL)" disabled={readOnly} onClick={insertImage}>
          🖼
        </TbButton>
        <TbButton title="Remover link" disabled={readOnly} onClick={() => { focusEditor(); run('unlink'); emitHtml(); }}>
          ⊘
        </TbButton>
        <span className="lb-toolbar-sep" />
        <TbButton title="Limpar formatação da seleção" disabled={readOnly} onClick={() => { focusEditor(); run('removeFormat'); emitHtml(); }}>
          ⨯ fmt
        </TbButton>
      </div>
      <div className="lb-editor-wrap">
        <div
          ref={editorRef}
          className="lb-editor"
          contentEditable={!readOnly}
          suppressContentEditableWarning
          data-placeholder={placeholder || ''}
          onInput={() => {
            if (syncingRef.current) return;
            emitHtml();
          }}
          onBlur={() => {
            emitHtml();
          }}
        />
      </div>
    </div>
  );
}
