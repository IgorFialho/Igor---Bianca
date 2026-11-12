"use client";

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { Caveat, Great_Vibes, Oswald, Special_Elite } from 'next/font/google';
import { Portal } from '@/components/home/portal';

// Fontes extras do texto por cima da foto (além das do site), carregadas só quando o editor é usado.
const scriptFont = Great_Vibes({ subsets: ['latin'], weight: '400', display: 'swap' });
const handFont = Caveat({ subsets: ['latin'], weight: ['700'], display: 'swap' });
const strongFont = Oswald({ subsets: ['latin'], weight: ['600'], display: 'swap' });
const typewriterFont = Special_Elite({ subsets: ['latin'], weight: '400', display: 'swap' });

// Editor de fotos do mural, no estilo do Instagram:
// - enquadrar: formato (original, 1:1, 4:5, 16:9), arrastar a foto para posicionar e zoom (pinça, rolagem ou barra);
// - texto por cima da foto: escrever (com emojis), arrastar, estilo, tamanho, ângulo e cores do texto, do fundo e da borda;
// - figurinhas de emoji: arrastar, tamanho e ângulo.
// O resultado é desenhado num canvas e vira a própria foto enviada (tudo no aparelho, antes do envio).
// Posições e tamanhos ficam guardados em frações do quadro, então o mesmo ajuste vale em qualquer tamanho de tela.

export type PhotoAspect = 'original' | '1:1' | '4:5' | '16:9';
export type PhotoTextLayer = {
  id: string;
  text: string;
  /** Centro do texto, em fração do quadro (0 a 1). */
  x: number;
  y: number;
  /** Tamanho da letra, em fração da largura do quadro. */
  size: number;
  color: string;
  style: TextFontKey;
  background: boolean;
  /** Cor do fundo (com `background`). Sem ela (edições antigas), o fundo usa `color` e o texto o contraste. */
  backgroundColor?: string;
  /** Ângulo em graus (-180 a 180). */
  rotation?: number;
  /** Cor da borda (contorno) das letras; ausente ou null = sem borda. */
  outlineColor?: string | null;
  /** Grossura da borda das letras, em fração do tamanho da letra. */
  outlineWidth?: number;
  /** Cor e grossura da borda do fundo (moldura da caixa do texto); null = sem borda. */
  boxBorderColor?: string | null;
  boxBorderWidth?: number;
  /** 'emoji': figurinha (só o emoji, sem cor, fundo nem sombra). */
  kind?: 'text' | 'emoji';
};
export type PhotoEditState = {
  aspect: PhotoAspect;
  zoom: number;
  /** Deslocamento do centro da foto, em fração da largura/altura do quadro. */
  offsetX: number;
  offsetY: number;
  texts: PhotoTextLayer[];
  /** Posição da área que aparece no card do mural, quando ele corta a foto (0 = topo/esquerda, 1 = base/direita). */
  muralFocus?: number;
};
export type PhotoEditResult = { blob: Blob; width: number; height: number; state: PhotoEditState };
/** Recorte de vídeo em frações do quadro original (0 a 1): o Cloudinary aplica ao processar o vídeo. */
export type VideoCrop = { x: number; y: number; w: number; h: number };
export type VideoCropResult = { crop: VideoCrop | null; width: number; height: number; state: PhotoEditState };

/** Formatos que o card do mural mostra inteiros (como o Instagram): de retrato 4:5 a paisagem 1,91:1. */
export const MURAL_MIN_RATIO = 0.8;
export const MURAL_MAX_RATIO = 1.91;

/** Proporção com que a mídia aparece no card do mural (fora da faixa, o card corta pelo centro). */
export function muralCardRatio(width: number, height: number) {
  return Math.min(MURAL_MAX_RATIO, Math.max(MURAL_MIN_RATIO, width / height));
}

/** Parte do quadro (em frações) que aparece no card do mural; focus posiciona a área (0.5 = centro). */
function muralVisibleArea(ratio: number, focus = 0.5) {
  const visible = muralCardRatio(ratio, 1);
  const f = Math.min(1, Math.max(0, focus));
  if (visible > ratio) {
    const h = ratio / visible;
    return { x: 0, y: (1 - h) * f, w: 1, h, axis: 'y' as const };
  }
  const w = visible / ratio;
  return { x: (1 - w) * f, y: 0, w, h: 1, axis: 'x' as const };
}

/** Posição CSS (object-position) que mostra no card a mesma parte escolhida no editor. */
export function muralObjectPosition(width: number | null | undefined, height: number | null | undefined, focus: number | null | undefined) {
  const f = Math.round(Math.min(1, Math.max(0, focus ?? 0.5)) * 1000) / 10;
  if (!width || !height) return '50% 50%';
  const ratio = width / height;
  if (ratio < MURAL_MIN_RATIO) return `50% ${f}%`;
  if (ratio > MURAL_MAX_RATIO) return `${f}% 50%`;
  return '50% 50%';
}

export const DEFAULT_PHOTO_EDIT: PhotoEditState = { aspect: 'original', zoom: 1, offsetX: 0, offsetY: 0, texts: [] };

const ASPECTS: { key: PhotoAspect; label: string; ratio: number | null }[] = [
  { key: 'original', label: 'Original', ratio: null },
  { key: '1:1', label: '1:1', ratio: 1 },
  { key: '4:5', label: '4:5', ratio: 4 / 5 },
  { key: '16:9', label: '16:9', ratio: 16 / 9 },
];
// Paleta do texto e do fundo: as cores do site (creme, champanhe, dourado, rosé, oliva) e outras para variar.
const TEXT_COLORS = [
  '#ffffff', '#1f1b16', '#fffaf1', '#f6edd7', '#e2b85f', '#8a5a2b',
  '#f2c4ce', '#c97a8a', '#9e4f63', '#b3261e', '#ff7a59', '#ffd84d',
  '#a8b892', '#617541', '#7fb3e0', '#1e3a5f', '#b39ddb', '#6b4f9e',
];
// Figurinhas e emojis do texto: só emojis antigos o bastante para aparecerem em qualquer aparelho.
const PHOTO_EMOJIS = [
  '❤️', '🤍', '💕', '💖', '💞', '💘', '💍', '💒',
  '👰', '🤵', '💐', '🌹', '🌸', '🌷', '🌼', '🕊️',
  '✨', '🌟', '🎉', '🥳', '🥂', '🍾', '🎶', '📸',
  '💃', '🕺', '😍', '🥰', '😘', '🤗', '😂', '😭',
  '😊', '🤩', '😎', '👏', '🙌', '🙏', '💯',
  '☀️', '🌙', '🍰', '🎂', '🦋', '👑', '💋', '🌺', '🎁',
];
/** Fontes do texto: as do site (Clássico e Simples) e outras no mesmo clima de casamento. */
export type TextFontKey = 'classic' | 'simple' | 'script' | 'hand' | 'strong' | 'typewriter';
type TextFont = { key: TextFontKey; label: string; className: string; weight: number; italic: boolean; upper: boolean };
const TEXT_FONTS: TextFont[] = [
  { key: 'classic', label: 'Clássico', className: 'font-display', weight: 400, italic: true, upper: false },
  { key: 'simple', label: 'Simples', className: 'font-sans', weight: 600, italic: false, upper: false },
  { key: 'script', label: 'Romântico', className: scriptFont.className, weight: 400, italic: false, upper: false },
  { key: 'hand', label: 'Manuscrito', className: handFont.className, weight: 700, italic: false, upper: false },
  { key: 'strong', label: 'Destaque', className: strongFont.className, weight: 600, italic: false, upper: true },
  { key: 'typewriter', label: 'Máquina', className: typewriterFont.className, weight: 400, italic: false, upper: false },
];
const fontOf = (key: TextFontKey | undefined) => TEXT_FONTS.find((font) => font.key === key) ?? TEXT_FONTS[0];
/** Estilo CSS da fonte (peso, itálico e caixa alta), igual ao que o canvas desenha. */
const fontStyle = (font: TextFont) =>
  ({ fontWeight: font.weight, fontStyle: font.italic ? 'italic' : 'normal', textTransform: font.upper ? 'uppercase' : 'none' }) as const;
const MAX_ZOOM = 4;
const MAX_OUTPUT = 2048;
const LINE_HEIGHT = 1.15;
const DEFAULT_TEXT_SIZE = 0.075;
const DEFAULT_EMOJI_SIZE = 0.18;
const TEXT_MAX_LENGTH = 120;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const newId = () => Math.random().toString(36).slice(2, 10);

/** Ângulo com "ímã": perto de 0°, ±45°, ±90° e ±180° ele encaixa no valor exato. */
function snapAngle(value: number) {
  for (const target of [-180, -90, -45, 0, 45, 90, 180]) {
    if (Math.abs(value - target) <= 3) return target;
  }
  return Math.round(value);
}

/** Grossuras das bordas, em fração do tamanho da letra: padrão e limites da barra "Grossura". */
const OUTLINE_WIDTH = 0.08;
const BOX_BORDER_WIDTH = 0.08;
const BORDER_WIDTH_RANGE = { min: 0.02, max: 0.2 };
const BOX_RADIUS = 0.4;

type LayerPaint = {
  fg: string;
  bg: string | null;
  stroke: string | null;
  strokeWidth: number;
  box: string | null;
  boxWidth: number;
  shadow: boolean;
};

/** Cores efetivas de uma camada: texto, fundo, bordas (ou null) e se leva sombra (só texto solto, sem fundo nem bordas). */
function layerPaint(layer: PhotoTextLayer): LayerPaint {
  const strokeWidth = layer.outlineWidth ?? OUTLINE_WIDTH;
  const boxWidth = layer.boxBorderWidth ?? BOX_BORDER_WIDTH;
  if (layer.kind === 'emoji') return { fg: '#000000', bg: null, stroke: null, strokeWidth, box: null, boxWidth, shadow: false };
  const stroke = layer.outlineColor || null;
  const box = layer.boxBorderColor || null;
  let fg = layer.color;
  let bg: string | null = null;
  if (layer.background) {
    if (layer.backgroundColor) bg = layer.backgroundColor;
    else {
      bg = layer.color;
      fg = contrastOn(layer.color);
    }
  }
  return { fg, bg, stroke, strokeWidth, box, boxWidth, shadow: !bg && !stroke && !box };
}

/** Estilo CSS da camada (pré-visualização): mesmas cores, fundo, bordas e sombra do desenho final. */
function layerTextStyle(paint: LayerPaint) {
  const hasBox = Boolean(paint.bg || paint.box);
  return {
    color: paint.fg,
    backgroundColor: paint.bg ?? 'transparent',
    // O fundo fica por dentro da borda da caixa (igual ao desenho final).
    backgroundClip: 'padding-box',
    padding: hasBox ? '0.35em 0.6em' : 0,
    border: paint.box ? `${paint.boxWidth}em solid ${paint.box}` : undefined,
    borderRadius: hasBox ? `${BOX_RADIUS}em` : 0,
    textShadow: paint.shadow ? '0 0.03em 0.12em rgba(0,0,0,0.5)' : 'none',
    // Borda por fora da letra: traço com o dobro da espessura, desenhado antes do preenchimento.
    WebkitTextStroke: paint.stroke ? `${paint.strokeWidth * 2}em ${paint.stroke}` : undefined,
    paintOrder: paint.stroke ? 'stroke fill' : undefined,
  } as const;
}

/** Cor do texto quando ele tem fundo colorido: escuro em fundos claros, branco nos escuros. */
function contrastOn(hex: string) {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#1f1b16' : '#ffffff';
}

/** Família de fonte usada pelo site (títulos ou texto), para o canvas desenhar igual à pré-visualização. */
function fontFamilyOf(className: string) {
  const probe = document.createElement('span');
  probe.className = className;
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  document.body.appendChild(probe);
  const family = window.getComputedStyle(probe).fontFamily;
  probe.remove();
  return family || 'serif';
}

type Decoded = { source: CanvasImageSource; width: number; height: number; url: string; release: () => void };

/** Lê a foto respeitando a rotação do celular (EXIF). */
async function decodePhoto(file: File): Promise<Decoded> {
  const url = URL.createObjectURL(file);
  if (typeof createImageBitmap === 'function') {
    for (const options of [{ imageOrientation: 'from-image' } as ImageBitmapOptions, undefined]) {
      try {
        const bitmap = options ? await createImageBitmap(file, options) : await createImageBitmap(file);
        return { source: bitmap, width: bitmap.width, height: bitmap.height, url, release: () => bitmap.close?.() };
      } catch {
        // tenta a próxima forma
      }
    }
  }
  const image = new Image();
  image.src = url;
  await image.decode();
  return { source: image, width: image.naturalWidth, height: image.naturalHeight, url, release: () => undefined };
}

/** Lê as dimensões do vídeo (já com a rotação do celular aplicada pelo navegador). */
function decodeVideo(file: File): Promise<Decoded> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () =>
      video.videoWidth && video.videoHeight
        ? resolve({ source: video, width: video.videoWidth, height: video.videoHeight, url, release: () => undefined })
        : reject(new Error('video'));
    video.onerror = () => reject(new Error('video'));
    video.src = url;
  });
}

type Props = {
  file: File;
  /** 'video': só recortar (formato, posição e zoom), sem texto. */
  kind?: 'image' | 'video';
  initialState?: PhotoEditState;
  onCancel: () => void;
  onDone?: (result: PhotoEditResult) => void;
  onCropDone?: (result: VideoCropResult) => void;
  /** O navegador não conseguiu abrir o arquivo (ex.: HEIC no Chrome): segue sem editar. */
  onUnsupported: () => void;
};

export function PhotoEditor({ file, kind = 'image', initialState, onCancel, onDone, onCropDone, onUnsupported }: Props) {
  const isVideo = kind === 'video';
  const [decoded, setDecoded] = useState<Decoded | null>(null);
  const [state, setState] = useState<PhotoEditState>(initialState ?? DEFAULT_PHOTO_EDIT);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Quadro de emojis aberto: 'add' (nova figurinha) ou 'insert' (emoji dentro do texto em edição).
  const [emojiTray, setEmojiTray] = useState<'add' | 'insert' | null>(null);
  // Na edição do texto, a paleta pinta o texto ou o fundo.
  const [colorTarget, setColorTarget] = useState<ColorTarget>('text');
  // Mostra no quadro a parte da foto que aparece no card do mural (o resto só aparece ao abrir a foto).
  const [showMuralArea, setShowMuralArea] = useState(true);

  const [stage, setStage] = useState({ width: 0, height: 0 });

  // Abre a foto (uma vez por arquivo).
  useEffect(() => {
    let cancelled = false;
    let current: Decoded | null = null;
    (isVideo ? decodeVideo(file) : decodePhoto(file))
      .then((result) => {
        if (cancelled) {
          result.release();
          URL.revokeObjectURL(result.url);
          return;
        }
        current = result;
        setDecoded(result);
      })
      .catch(() => {
        if (!cancelled) onUnsupported();
      });
    return () => {
      cancelled = true;
      if (current) {
        current.release();
        URL.revokeObjectURL(current.url);
      }
    };
  }, [file, isVideo, onUnsupported]);

  // Espaço disponível para o quadro (muda ao girar o celular ou redimensionar). Medido assim que a área aparece:
  // o editor abre num portal, então ela só existe um instante depois de o componente montar.
  const [stageElement, setStageElement] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!stageElement) return;
    const update = () => setStage({ width: stageElement.clientWidth, height: stageElement.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stageElement);
    return () => observer.disconnect();
  }, [stageElement]);

  // Trava a rolagem da página e trata o Esc (fecha a edição de texto antes de fechar o editor).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      if (emojiTray) setEmojiTray(null);
      else if (editingId) setEditingId(null);
      else if (!isSaving) onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [emojiTray, editingId, isSaving, onCancel]);

  const ratio = ASPECTS.find((item) => item.key === state.aspect)?.ratio ?? (decoded ? decoded.width / decoded.height : 1);
  const frameWidth = stage.width && stage.height ? Math.min(stage.width, stage.height * ratio) : 0;
  const frameHeight = frameWidth / ratio;
  const baseScale = decoded && frameWidth ? Math.max(frameWidth / decoded.width, frameHeight / decoded.height) : 1;
  const displayWidth = decoded ? decoded.width * baseScale * state.zoom : 0;
  const displayHeight = decoded ? decoded.height * baseScale * state.zoom : 0;

  /** Mantém a foto cobrindo o quadro inteiro (sem sobrar faixa vazia). */
  const clampOffsets = useCallback(
    (next: PhotoEditState): PhotoEditState => {
      if (!decoded || !frameWidth) return next;
      const nextRatio = ASPECTS.find((item) => item.key === next.aspect)?.ratio ?? decoded.width / decoded.height;
      const fw = Math.min(stage.width, stage.height * nextRatio);
      const fh = fw / nextRatio;
      const scale = Math.max(fw / decoded.width, fh / decoded.height) * next.zoom;
      const maxX = Math.max(0, (decoded.width * scale - fw) / 2) / fw;
      const maxY = Math.max(0, (decoded.height * scale - fh) / 2) / fh;
      return { ...next, offsetX: clamp(next.offsetX, -maxX, maxX), offsetY: clamp(next.offsetY, -maxY, maxY) };
    },
    [decoded, frameWidth, stage.width, stage.height]
  );

  const update = useCallback((patch: Partial<PhotoEditState>) => setState((current) => clampOffsets({ ...current, ...patch })), [clampOffsets]);

  // ---------- Gestos na foto: arrastar (1 dedo), pinça (2 dedos) e rolagem do mouse ----------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startDistance: number; startZoom: number } | null>(null);
  const textDrag = useRef<{ id: string; pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);

  const onFramePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (textDrag.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setSelectedId(null);
    setIsDragging(true);
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      gesture.current = { startDistance: Math.hypot(a.x - b.x, a.y - b.y), startZoom: state.zoom };
    }
  };

  const onFramePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous || !frameWidth) return;
    const current = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, current);
    if (pointers.current.size >= 2 && gesture.current) {
      const [a, b] = Array.from(pointers.current.values());
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const zoom = clamp((gesture.current.startZoom * distance) / Math.max(1, gesture.current.startDistance), 1, MAX_ZOOM);
      // Na pinça, o meio dos dois dedos também arrasta a foto (metade do movimento de cada dedo).
      setState((value) =>
        clampOffsets({
          ...value,
          zoom,
          offsetX: value.offsetX + (current.x - previous.x) / 2 / frameWidth,
          offsetY: value.offsetY + (current.y - previous.y) / 2 / frameHeight,
        })
      );
      return;
    }
    setState((value) =>
      clampOffsets({ ...value, offsetX: value.offsetX + (current.x - previous.x) / frameWidth, offsetY: value.offsetY + (current.y - previous.y) / frameHeight })
    );
  };

  const onFramePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    if (pointers.current.size === 0) setIsDragging(false);
  };

  // Rolagem do mouse = zoom (precisa ser "não passivo" para não rolar a página junto).
  const frameRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setState((value) => clampOffsets({ ...value, zoom: clamp(value.zoom * Math.exp(-event.deltaY * 0.0015), 1, MAX_ZOOM) }));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [clampOffsets, decoded]);

  // Ao trocar de formato, refaz o enquadramento dentro dos novos limites.
  useEffect(() => {
    setState((value) => clampOffsets(value));
  }, [clampOffsets]);

  // ---------- Textos ----------
  const texts = state.texts;
  const editing = texts.find((item) => item.id === editingId) ?? null;
  const selected = texts.find((item) => item.id === selectedId) ?? null;

  const updateText = (id: string, patch: Partial<PhotoTextLayer>) =>
    setState((value) => ({ ...value, texts: value.texts.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));

  const addText = () => {
    const layer: PhotoTextLayer = {
      id: newId(),
      text: '',
      x: 0.5,
      y: 0.5,
      size: DEFAULT_TEXT_SIZE,
      color: '#ffffff',
      style: 'classic',
      background: false,
      backgroundColor: '#1f1b16',
      rotation: 0,
      kind: 'text',
    };
    setState((value) => ({ ...value, texts: [...value.texts, layer] }));
    setSelectedId(layer.id);
    openEditing(layer.id);
  };

  // Figurinha: o emoji entra no meio da foto, já selecionado (arrastar move; tocar abre tamanho e ângulo).
  const addEmoji = (emoji: string) => {
    const layer: PhotoTextLayer = {
      id: newId(),
      text: emoji,
      x: 0.5,
      y: 0.5,
      size: DEFAULT_EMOJI_SIZE,
      color: '#000000',
      style: 'simple',
      background: false,
      rotation: 0,
      kind: 'emoji',
    };
    setState((value) => ({ ...value, texts: [...value.texts, layer] }));
    setSelectedId(layer.id);
    setEmojiTray(null);
  };

  // Escolher a cor do fundo (null = sem fundo). Se o texto ficaria da mesma cor do fundo, troca pelo contraste.
  const setLayerBackground = (layer: PhotoTextLayer, color: string | null) => {
    if (!color) {
      updateText(layer.id, { background: false });
      return;
    }
    const current = layerPaint(layer).fg;
    updateText(layer.id, {
      background: true,
      backgroundColor: color,
      color: current.toLowerCase() === color.toLowerCase() ? contrastOn(color) : current,
    });
  };

  // Emoji dentro do texto: entra onde está o cursor.
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const insertEmojiInText = (emoji: string) => {
    if (!editing) return;
    const field = textAreaRef.current;
    const start = field?.selectionStart ?? editing.text.length;
    const end = field?.selectionEnd ?? editing.text.length;
    const next = editing.text.slice(0, start) + emoji + editing.text.slice(end);
    if (next.length > TEXT_MAX_LENGTH) return;
    updateText(editing.id, { text: next });
    window.requestAnimationFrame(() => {
      if (!field) return;
      const caret = start + emoji.length;
      field.focus();
      field.setSelectionRange(caret, caret);
    });
  };

  const removeText = (id: string) => {
    setState((value) => ({ ...value, texts: value.texts.filter((item) => item.id !== id) }));
    setSelectedId(null);
    setEditingId(null);
  };

  const openEditing = (id: string) => {
    setEditingId(id);
    setColorTarget('text');
    setEmojiTray(null);
  };

  const finishEditing = () => {
    setEmojiTray(null);
    if (editing && !editing.text.trim()) removeText(editing.id);
    else setEditingId(null);
  };

  // Arrastar a área clara (parte que aparece no card): só no sentido em que o card corta, sem sair da foto.
  const areaDrag = useRef<{ pointerId: number; start: number; origin: number; span: number; axis: 'x' | 'y' } | null>(null);
  const [isMovingArea, setIsMovingArea] = useState(false);
  const onAreaPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!frameWidth) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const area = muralVisibleArea(ratio, state.muralFocus ?? 0.5);
    const span = area.axis === 'y' ? (1 - area.h) * frameHeight : (1 - area.w) * frameWidth;
    areaDrag.current = {
      pointerId: event.pointerId,
      start: area.axis === 'y' ? event.clientY : event.clientX,
      origin: state.muralFocus ?? 0.5,
      span: Math.max(1, span),
      axis: area.axis,
    };
    setSelectedId(null);
    setIsMovingArea(true);
  };
  const onAreaPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = areaDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = (drag.axis === 'y' ? event.clientY : event.clientX) - drag.start;
    const next = clamp(drag.origin + delta / drag.span, 0, 1);
    // Ímã no centro: fica fácil voltar para o meio.
    setState((value) => ({ ...value, muralFocus: Math.abs(next - 0.5) < 0.03 ? 0.5 : next }));
  };
  const onAreaPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (areaDrag.current?.pointerId !== event.pointerId) return;
    areaDrag.current = null;
    setIsMovingArea(false);
  };

  const onTextPointerDown = (event: ReactPointerEvent<HTMLDivElement>, layer: PhotoTextLayer) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    textDrag.current = { id: layer.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: layer.x, originY: layer.y, moved: false };
    setSelectedId(layer.id);
  };

  const onTextPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = textDrag.current;
    if (!drag || drag.pointerId !== event.pointerId || !frameWidth) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    updateText(drag.id, { x: clamp(drag.originX + dx / frameWidth, 0.03, 0.97), y: clamp(drag.originY + dy / frameHeight, 0.03, 0.97) });
  };

  const onTextPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = textDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    textDrag.current = null;
    // Toque sem arrastar: abre a edição do texto.
    if (!drag.moved) openEditing(drag.id);
  };

  // ---------- Gerar a foto final ----------
  const save = async () => {
    if (!decoded || !frameWidth || isSaving) return;
    setIsSaving(true);

    // Vídeo: só calcula o recorte (em frações do quadro original); o arquivo vai inteiro e o Cloudinary recorta.
    if (isVideo) {
      const left = frameWidth / 2 + state.offsetX * frameWidth - displayWidth / 2;
      const top = frameHeight / 2 + state.offsetY * frameHeight - displayHeight / 2;
      const round = (value: number) => Math.round(value * 10000) / 10000;
      const w = round(clamp(frameWidth / displayWidth, 0.05, 1));
      const h = round(clamp(frameHeight / displayHeight, 0.05, 1));
      const x = round(clamp(-left / displayWidth, 0, 1 - w));
      const y = round(clamp(-top / displayHeight, 0, 1 - h));
      const isFull = w > 0.999 && h > 0.999;
      onCropDone?.({
        crop: isFull ? null : { x, y, w, h },
        width: Math.round(decoded.width * (isFull ? 1 : w)),
        height: Math.round(decoded.height * (isFull ? 1 : h)),
        state,
      });
      return;
    }

    try {
      // Tamanho final: a resolução real do recorte (até 2048 px no lado maior), sem ampliar à toa.
      const cropWidth = frameWidth / (baseScale * state.zoom);
      const cropHeight = frameHeight / (baseScale * state.zoom);
      const fit = Math.min(1, MAX_OUTPUT / Math.max(cropWidth, cropHeight));
      const outWidth = Math.max(1, Math.round(cropWidth * fit));
      const outHeight = Math.max(1, Math.round(cropHeight * fit));
      const k = outWidth / frameWidth;

      const canvas = document.createElement('canvas');
      canvas.width = outWidth;
      canvas.height = outHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas');
      context.fillStyle = '#000';
      context.fillRect(0, 0, outWidth, outHeight);
      context.save();
      context.translate(outWidth / 2 + state.offsetX * frameWidth * k, outHeight / 2 + state.offsetY * frameHeight * k);
      context.scale(baseScale * state.zoom * k, baseScale * state.zoom * k);
      context.drawImage(decoded.source, -decoded.width / 2, -decoded.height / 2);
      context.restore();

      const simpleFamily = fontFamilyOf('font-sans');
      const families = new Map<TextFontKey, string>();
      for (const layer of texts) {
        if (!layer.text.trim()) continue;
        const fontSize = layer.size * frameWidth * k;
        const paint = layerPaint(layer);
        const textFont = fontOf(layer.style);
        if (!families.has(textFont.key)) families.set(textFont.key, fontFamilyOf(textFont.className));
        const font =
          layer.kind === 'emoji'
            ? `400 ${fontSize}px ${simpleFamily}`
            : `${textFont.italic ? 'italic ' : ''}${textFont.weight} ${fontSize}px ${families.get(textFont.key)}`;
        try {
          await document.fonts?.load(font, layer.text);
        } catch {
          // segue com a fonte que estiver disponível
        }
        context.font = font;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        const lines = (layer.kind !== 'emoji' && textFont.upper ? layer.text.toUpperCase() : layer.text).split('\n');
        const lineHeight = fontSize * LINE_HEIGHT;
        const blockHeight = lineHeight * lines.length;
        // Desenha a partir do centro do texto, girado no ângulo escolhido (igual à pré-visualização).
        context.save();
        context.translate(layer.x * outWidth, layer.y * outHeight);
        context.rotate(((layer.rotation ?? 0) * Math.PI) / 180);
        if (paint.bg || paint.box) {
          const width = Math.max(...lines.map((line) => context.measureText(line).width));
          const padX = fontSize * 0.6;
          const padY = fontSize * 0.35;
          const border = paint.box ? fontSize * paint.boxWidth : 0;
          const outerRadius = fontSize * BOX_RADIUS;
          const roundedRect = (inset: number, radius: number) => {
            const x = -width / 2 - padX - border + inset;
            const y = -blockHeight / 2 - padY - border + inset;
            const w = width + (padX + border - inset) * 2;
            const h = blockHeight + (padY + border - inset) * 2;
            context.beginPath();
            if (typeof context.roundRect === 'function') context.roundRect(x, y, w, h, Math.max(0, radius));
            else context.rect(x, y, w, h);
          };
          // Fundo por dentro da borda; a borda por fora dele (como no CSS da pré-visualização).
          if (paint.bg) {
            roundedRect(border, outerRadius - border);
            context.fillStyle = paint.bg;
            context.fill();
          }
          if (paint.box) {
            roundedRect(border / 2, outerRadius - border / 2);
            context.strokeStyle = paint.box;
            context.lineWidth = border;
            context.stroke();
          }
        }
        if (paint.stroke) {
          // Borda: traço largo e arredondado embaixo; o preenchimento por cima esconde a metade de dentro.
          context.strokeStyle = paint.stroke;
          context.lineWidth = fontSize * paint.strokeWidth * 2;
          context.lineJoin = 'round';
          context.miterLimit = 2;
          lines.forEach((line, index) => {
            context.strokeText(line, 0, -blockHeight / 2 + lineHeight * (index + 0.5));
          });
        }
        context.fillStyle = paint.fg;
        if (paint.shadow) {
          context.shadowColor = 'rgba(0,0,0,0.5)';
          context.shadowBlur = fontSize * 0.12;
          context.shadowOffsetY = fontSize * 0.03;
        }
        lines.forEach((line, index) => {
          context.fillText(line, 0, -blockHeight / 2 + lineHeight * (index + 0.5));
        });
        context.restore();
      }

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('toBlob');
      onDone?.({ blob, width: outWidth, height: outHeight, state });
    } catch {
      setIsSaving(false);
      onUnsupported();
    }
  };

  const imageLeft = frameWidth / 2 + state.offsetX * frameWidth - displayWidth / 2;
  const imageTop = frameHeight / 2 + state.offsetY * frameHeight - displayHeight / 2;
  const isCentered = state.zoom === 1 && state.offsetX === 0 && state.offsetY === 0;
  const muralArea = muralVisibleArea(ratio, state.muralFocus ?? 0.5);
  const muralCrops = muralArea.w < 0.995 || muralArea.h < 0.995;
  const muralLabel = muralArea.h < 1 ? 'retrato 4:5' : 'paisagem 1,91:1';
  // Texto/figurinha com o centro fora da parte que aparece no card.
  const textOutsideMural =
    muralCrops &&
    texts.some(
      (layer) =>
        layer.text.trim() &&
        (layer.x < muralArea.x || layer.x > muralArea.x + muralArea.w || layer.y < muralArea.y || layer.y > muralArea.y + muralArea.h)
    );

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[260] flex flex-col bg-zinc-950 text-white"
        role="dialog"
        aria-modal="true"
        aria-label={isVideo ? 'Recortar vídeo' : 'Editar foto'}
        // A janela de postar fecha ao tocar fora dela: os toques aqui não podem chegar até lá.
        onClick={(event) => event.stopPropagation()}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <button type="button" onClick={onCancel} disabled={isSaving} className="rounded-full px-3 py-2 text-sm text-white/80 hover:bg-white/10">
            Cancelar
          </button>
          <p className="font-display text-xl italic">{isVideo ? 'Recortar vídeo' : 'Editar foto'}</p>
          <button
            type="button"
            onClick={save}
            disabled={!decoded || isSaving}
            className="rounded-full bg-champagne-600 px-4 py-2 text-sm font-medium text-[#fff9f1] disabled:opacity-50"
          >
            {isSaving ? 'Salvando…' : 'Concluir'}
          </button>
        </div>

        <div ref={setStageElement} className="relative flex min-h-0 flex-1 items-center justify-center px-3">
          {!decoded ? <p className="text-sm text-white/70">{isVideo ? 'Abrindo o vídeo…' : 'Abrindo a foto…'}</p> : null}
          {decoded && frameWidth ? (
            <div
              ref={frameRef}
              className="relative touch-none select-none overflow-hidden bg-black"
              style={{ width: frameWidth, height: frameHeight }}
              onPointerDown={onFramePointerDown}
              onPointerMove={onFramePointerMove}
              onPointerUp={onFramePointerUp}
              onPointerCancel={onFramePointerUp}
            >
              {isVideo ? (
                <video
                  src={decoded.url}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="pointer-events-none absolute max-w-none object-fill"
                  style={{ left: imageLeft, top: imageTop, width: displayWidth, height: displayHeight }}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={decoded.url}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute max-w-none"
                  style={{ left: imageLeft, top: imageTop, width: displayWidth, height: displayHeight }}
                />
              )}

              {/* Grade de terços enquanto arrasta (ajuda a centralizar). */}
              <div className={`pointer-events-none absolute inset-0 transition-opacity duration-200 ${isDragging ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true">
                <span className="absolute inset-y-0 left-1/3 w-px bg-white/50" />
                <span className="absolute inset-y-0 left-2/3 w-px bg-white/50" />
                <span className="absolute inset-x-0 top-1/3 h-px bg-white/50" />
                <span className="absolute inset-x-0 top-2/3 h-px bg-white/50" />
              </div>

              {/* Área que aparece no card do mural: o resto fica escurecido (só aparece ao abrir a foto). */}
              {muralCrops && showMuralArea ? (
                <div
                  role="slider"
                  aria-label="Área que aparece no mural: arraste para escolher"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round((state.muralFocus ?? 0.5) * 100)}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    const back = muralArea.axis === 'y' ? 'ArrowUp' : 'ArrowLeft';
                    const forward = muralArea.axis === 'y' ? 'ArrowDown' : 'ArrowRight';
                    if (event.key !== back && event.key !== forward) return;
                    event.preventDefault();
                    const step = event.key === forward ? 0.05 : -0.05;
                    setState((value) => ({ ...value, muralFocus: clamp((value.muralFocus ?? 0.5) + step, 0, 1) }));
                  }}
                  onPointerDown={onAreaPointerDown}
                  onPointerMove={onAreaPointerMove}
                  onPointerUp={onAreaPointerUp}
                  onPointerCancel={onAreaPointerUp}
                  className={`absolute z-[5] touch-none rounded-[2px] border-2 border-dashed focus:outline-none focus-visible:border-[#e7c88a] ${
                    isMovingArea ? 'cursor-grabbing border-white' : `border-white/80 ${muralArea.axis === 'y' ? 'cursor-ns-resize' : 'cursor-ew-resize'}`
                  }`}
                  style={{
                    left: muralArea.x * frameWidth,
                    top: muralArea.y * frameHeight,
                    width: muralArea.w * frameWidth,
                    height: muralArea.h * frameHeight,
                    boxShadow: `0 0 0 9999px rgba(0,0,0,${isMovingArea ? 0.4 : 0.55})`,
                    transition: isMovingArea ? 'box-shadow 0.2s' : 'top 0.3s, left 0.3s, width 0.3s, height 0.3s, box-shadow 0.2s',
                  }}
                >
                  <span className="pointer-events-none absolute left-1/2 top-2 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-black/60 px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-white/90 backdrop-blur-sm">
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                      {muralArea.axis === 'y' ? (
                        <path d="M12 3v18M7 8l5-5 5 5M7 16l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                      ) : (
                        <path d="M3 12h18M8 7l-5 5 5 5M16 7l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                      )}
                    </svg>
                    Aparece no mural
                  </span>
                  {/* Pegador no meio da borda que pode andar. */}
                  <span
                    className={`pointer-events-none absolute rounded-full bg-white/90 shadow ${
                      muralArea.axis === 'y' ? 'bottom-[-5px] left-1/2 h-[8px] w-10 -translate-x-1/2' : 'right-[-5px] top-1/2 h-10 w-[8px] -translate-y-1/2'
                    }`}
                    aria-hidden="true"
                  />
                </div>
              ) : null}

              {texts.map((layer) => {
                if (layer.id === editingId) return null;
                const paint = layerPaint(layer);
                return (
                  <div
                    key={layer.id}
                    className={`absolute z-10 cursor-move touch-none whitespace-pre text-center ${
                      layer.kind === 'emoji' ? 'font-sans' : fontOf(layer.style).className
                    } ${layer.id === selectedId ? 'outline outline-1 outline-offset-4 outline-white/70' : ''}`}
                    style={{
                      left: layer.x * frameWidth,
                      top: layer.y * frameHeight,
                      transform: `translate(-50%, -50%) rotate(${layer.rotation ?? 0}deg)`,
                      fontSize: layer.size * frameWidth,
                      lineHeight: LINE_HEIGHT,
                      ...(layer.kind === 'emoji' ? {} : fontStyle(fontOf(layer.style))),
                      ...layerTextStyle(paint),
                    }}
                    onPointerDown={(event) => onTextPointerDown(event, layer)}
                    onPointerMove={onTextPointerMove}
                    onPointerUp={onTextPointerUp}
                    onPointerCancel={onTextPointerUp}
                  >
                    {layer.text}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* Ferramentas */}
        <div className="relative space-y-3 px-4 pb-4 pt-3">
          {selected && !editing ? (
            <div className="flex items-center justify-center gap-2 text-xs">
              <button type="button" onClick={() => openEditing(selected.id)} className="rounded-full bg-white/10 px-3 py-1.5 hover:bg-white/20">
                {selected.kind === 'emoji' ? 'Tamanho e ângulo' : 'Editar texto'}
              </button>
              <button type="button" onClick={() => removeText(selected.id)} className="rounded-full bg-rose-500/20 px-3 py-1.5 text-rose-100 hover:bg-rose-500/30">
                {selected.kind === 'emoji' ? 'Remover emoji' : 'Remover texto'}
              </button>
            </div>
          ) : null}
          {/* Como a foto aparece no card do mural (só quando o card vai cortar a foto). */}
          {decoded && frameWidth && muralCrops ? (
            <div className="flex flex-wrap items-center justify-center gap-2 text-center text-xs">
              <span className="text-white/75">
                No mural, o card mostra só a área clara ({muralLabel}): arraste-a para escolher a parte da foto. Ao abrir a foto, ela aparece inteira.
              </span>
              <button
                type="button"
                onClick={() => setShowMuralArea((value) => !value)}
                aria-pressed={showMuralArea}
                className={`rounded-full px-3 py-1 font-medium transition-colors ${showMuralArea ? 'bg-white text-zinc-900' : 'bg-white/10 text-white hover:bg-white/20'}`}
              >
                {showMuralArea ? 'Esconder área' : 'Ver área do mural'}
              </button>
              {textOutsideMural ? (
                <span className="w-full text-amber-200">Algum texto ou emoji ficou fora da área do mural: só aparece ao abrir a foto.</span>
              ) : null}
            </div>
          ) : null}
          <div className="flex items-center justify-center gap-2">
            {ASPECTS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => update({ aspect: item.key })}
                aria-pressed={state.aspect === item.key}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  state.aspect === item.key ? 'bg-white text-zinc-900' : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mx-auto flex max-w-md items-center gap-3">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-white/60" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="6" />
              <path d="M20 20l-4.5-4.5M8.5 11h5" strokeLinecap="round" />
            </svg>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={state.zoom}
              onChange={(event) => update({ zoom: Number(event.target.value) })}
              aria-label="Zoom"
              className="h-1 flex-1 cursor-pointer accent-[#e7c88a]"
            />
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-white/60" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="6" />
              <path d="M20 20l-4.5-4.5M8.5 11h5M11 8.5v5" strokeLinecap="round" />
            </svg>
          </div>
          <div className="flex items-center justify-center gap-2">
            {/* Texto e emojis por cima: só nas fotos (no vídeo, o editor só recorta). */}
            {!isVideo ? (
              <>
                <button type="button" onClick={addText} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
                  <span className="font-display text-lg italic leading-none">Aa</span> Texto
                </button>
                <button
                  type="button"
                  onClick={() => setEmojiTray((tray) => (tray === 'add' ? null : 'add'))}
                  aria-expanded={emojiTray === 'add'}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm ${emojiTray === 'add' ? 'bg-white text-zinc-900' : 'bg-white/10 hover:bg-white/20'}`}
                >
                  <span className="text-lg leading-none" aria-hidden="true">😊</span> Emoji
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => update({ zoom: 1, offsetX: 0, offsetY: 0 })}
              disabled={isCentered}
              className="rounded-full bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-40"
            >
              Centralizar
            </button>
          </div>

          {/* Quadro de figurinhas: o emoji escolhido entra no meio da foto. */}
          <AnimatePresence>
            {emojiTray === 'add' ? (
              <motion.div
                key="emoji-add"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="absolute inset-x-3 bottom-full z-10 mb-2"
              >
                <EmojiGrid onSelect={addEmoji} onClose={() => setEmojiTray(null)} label="Escolha uma figurinha" />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Editando um texto ou uma figurinha */}
        <AnimatePresence>
          {editing ? (
            <motion.div
              key="text-editor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 flex flex-col bg-black/70 backdrop-blur-sm"
              style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <button type="button" onClick={() => removeText(editing.id)} className="rounded-full px-3 py-2 text-sm text-rose-200 hover:bg-white/10">
                  Remover
                </button>
                <p className="text-sm text-white/80">{editing.kind === 'emoji' ? 'Figurinha' : 'Texto'}</p>
                <button type="button" onClick={finishEditing} className="rounded-full bg-champagne-600 px-4 py-2 text-sm font-medium text-[#fff9f1]">
                  Pronto
                </button>
              </div>
              {editing.kind !== 'emoji' ? (
                // Fontes: cada botão já mostra o nome na própria fonte (como no Instagram).
                <div className="flex justify-center px-3">
                  <div className="flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="radiogroup" aria-label="Fonte do texto">
                    {TEXT_FONTS.map((font) => {
                      const active = fontOf(editing.style).key === font.key;
                      return (
                        <button
                          key={font.key}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => updateText(editing.id, { style: font.key })}
                          className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[0.95rem] leading-tight transition-colors ${font.className} ${
                            active ? 'bg-white text-zinc-900' : 'bg-white/10 text-white/85 hover:bg-white/20'
                          }`}
                          style={fontStyle(font)}
                        >
                          {font.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6">
                {editing.kind === 'emoji' ? (
                  <span
                    className="select-none font-sans"
                    style={{ fontSize: clamp(editing.size * 520, 48, 150), lineHeight: 1, transform: `rotate(${editing.rotation ?? 0}deg)` }}
                    aria-hidden="true"
                  >
                    {editing.text}
                  </span>
                ) : (
                  // O campo cresce com o texto (cópia invisível ao lado define o tamanho), então o fundo abraça as letras.
                  <div
                    className={`inline-grid max-w-full text-center ${fontOf(editing.style).className}`}
                    style={{
                      fontSize: clamp(editing.size * 420, 18, 44),
                      lineHeight: LINE_HEIGHT,
                      ...fontStyle(fontOf(editing.style)),
                      ...layerTextStyle(layerPaint(editing)),
                      transform: `rotate(${editing.rotation ?? 0}deg)`,
                    }}
                  >
                    <span aria-hidden="true" className="invisible whitespace-pre-wrap break-words [grid-area:1/1]">
                      {(editing.text || 'Escreva algo…') + ' '}
                    </span>
                    <textarea
                      ref={textAreaRef}
                      autoFocus
                      value={editing.text}
                      onChange={(event) => updateText(editing.id, { text: event.target.value.slice(0, TEXT_MAX_LENGTH) })}
                      rows={1}
                      cols={1}
                      placeholder="Escreva algo…"
                      className="min-w-0 resize-none overflow-hidden bg-transparent p-0 text-center [font:inherit] [grid-area:1/1] placeholder:text-white/40 focus:outline-none"
                      style={{ color: 'inherit', WebkitTextStroke: 'inherit', paintOrder: 'inherit', textShadow: 'inherit', lineHeight: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit' }}
                    />
                  </div>
                )}
              </div>

              <div className="relative mx-auto w-full max-w-md space-y-3.5 px-4 pb-5">
                {/* Emojis: na figurinha, trocar o emoji; no texto, inserir no cursor. */}
                <AnimatePresence>
                  {emojiTray === 'insert' ? (
                    <motion.div
                      key="emoji-insert"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 12 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="absolute inset-x-3 bottom-full z-10 mb-2"
                    >
                      <EmojiGrid
                        label={editing.kind === 'emoji' ? 'Trocar a figurinha' : 'Inserir emoji no texto'}
                        onClose={() => setEmojiTray(null)}
                        onSelect={(emoji) => {
                          if (editing.kind === 'emoji') {
                            updateText(editing.id, { text: emoji });
                            setEmojiTray(null);
                          } else insertEmojiInText(emoji);
                        }}
                      />
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <div className="flex items-center gap-3">
                  <span className="w-12 shrink-0 text-xs text-white/60">Tamanho</span>
                  <input
                    type="range"
                    min={editing.kind === 'emoji' ? 0.06 : 0.04}
                    max={editing.kind === 'emoji' ? 0.4 : 0.16}
                    step={0.005}
                    value={editing.size}
                    onChange={(event) => updateText(editing.id, { size: Number(event.target.value) })}
                    aria-label="Tamanho"
                    className="h-1 flex-1 cursor-pointer accent-[#e7c88a]"
                  />
                  <button
                    type="button"
                    onClick={() => setEmojiTray((tray) => (tray === 'insert' ? null : 'insert'))}
                    aria-expanded={emojiTray === 'insert'}
                    aria-label={editing.kind === 'emoji' ? 'Trocar emoji' : 'Inserir emoji'}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${emojiTray === 'insert' ? 'bg-white' : 'bg-white/10 hover:bg-white/20'}`}
                  >
                    <span aria-hidden="true">😊</span>
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <span className="w-12 shrink-0 text-xs text-white/60">Ângulo</span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={1}
                    value={editing.rotation ?? 0}
                    onChange={(event) => updateText(editing.id, { rotation: snapAngle(Number(event.target.value)) })}
                    aria-label="Ângulo"
                    className="h-1 flex-1 cursor-pointer accent-[#e7c88a]"
                  />
                  <button
                    type="button"
                    onClick={() => updateText(editing.id, { rotation: 0 })}
                    disabled={!editing.rotation}
                    aria-label="Voltar o ângulo para 0°"
                    className="w-12 shrink-0 rounded-full bg-white/10 py-1.5 text-center text-xs tabular-nums hover:bg-white/20 disabled:opacity-60"
                  >
                    {editing.rotation ?? 0}°
                  </button>
                </div>

                {editing.kind !== 'emoji' ? (
                  <ColorPicker
                    target={colorTarget}
                    onTarget={setColorTarget}
                    paint={layerPaint(editing)}
                    onPick={(color) => {
                      if (colorTarget === 'text') updateText(editing.id, { color: color ?? '#ffffff' });
                      else if (colorTarget === 'background') setLayerBackground(editing, color);
                      else if (colorTarget === 'outline') updateText(editing.id, { outlineColor: color });
                      else updateText(editing.id, { boxBorderColor: color });
                    }}
                    onWidth={(width) =>
                      updateText(editing.id, colorTarget === 'outline' ? { outlineWidth: width } : { boxBorderWidth: width })
                    }
                  />
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </Portal>
  );
}

/** Quadro de emojis (escuro, no padrão do editor). */
function EmojiGrid({ onSelect, onClose, label }: { onSelect: (emoji: string) => void; onClose: () => void; label: string }) {
  return (
    <div role="dialog" aria-label={label} className="mx-auto max-w-md rounded-2xl border border-white/10 bg-zinc-900/95 p-2.5 shadow-2xl backdrop-blur">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <p className="text-xs text-white/70">{label}</p>
        <button type="button" onClick={onClose} aria-label="Fechar emojis" className="rounded-full px-2 py-0.5 text-sm text-white/70 hover:bg-white/10">
          ✕
        </button>
      </div>
      <div className="grid max-h-[11.5rem] grid-cols-8 gap-1 overflow-y-auto">
        {PHOTO_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onSelect(emoji)}
            aria-label={emoji}
            className="flex aspect-square items-center justify-center rounded-lg text-2xl transition-colors hover:bg-white/10 focus:outline-none focus-visible:bg-white/15"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

type ColorTarget = 'text' | 'background' | 'outline' | 'boxBorder';

const COLOR_TARGETS: { key: ColorTarget; label: string }[] = [
  { key: 'text', label: 'Texto' },
  { key: 'background', label: 'Fundo' },
  { key: 'outline', label: 'Borda' },
  { key: 'boxBorder', label: 'Borda do fundo' },
];

/** Cores do texto, do fundo e da borda: abas, paleta e uma cor livre (seletor do aparelho). */
function ColorPicker({
  target,
  onTarget,
  paint,
  onPick,
  onWidth,
}: {
  target: ColorTarget;
  onTarget: (target: ColorTarget) => void;
  paint: LayerPaint;
  onPick: (color: string | null) => void;
  onWidth: (width: number) => void;
}) {
  const current =
    target === 'text' ? paint.fg : target === 'background' ? paint.bg : target === 'outline' ? paint.stroke : paint.box;
  const width = target === 'outline' ? paint.strokeWidth : paint.boxWidth;
  const isPreset = current ? TEXT_COLORS.includes(current.toLowerCase()) : true;
  const [customOpen, setCustomOpen] = useState(false);
  const customButtonRef = useRef<HTMLButtonElement>(null);
  // Trocar de aba fecha o painel de cor livre.
  useEffect(() => setCustomOpen(false), [target]);

  // Carrossel de cores: setas nas pontas (somem quando não há mais para onde rolar) e bordas esmaecidas.
  const rowRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const updateEdges = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    setEdges({ left: row.scrollLeft > 4, right: row.scrollLeft + row.clientWidth < row.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    updateEdges();
    const observer = new ResizeObserver(updateEdges);
    observer.observe(row);
    return () => observer.disconnect();
  }, [updateEdges]);
  // Ao trocar de aba (texto, fundo, bordas), mostra a cor escolhida dela.
  useEffect(() => {
    const row = rowRef.current;
    const active = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (row && active) row.scrollTo({ left: active.offsetLeft - row.clientWidth / 2 + active.clientWidth / 2, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  const scrollColors = (direction: 1 | -1) => {
    const row = rowRef.current;
    if (row) row.scrollBy({ left: direction * row.clientWidth * 0.75, behavior: 'smooth' });
  };
  const fade = `linear-gradient(to right, ${edges.left ? 'transparent' : '#000'}, #000 ${edges.left ? '28px' : '0px'}, #000 calc(100% - ${edges.right ? '28px' : '0px'}), ${edges.right ? 'transparent' : '#000'})`;
  const arrowClass =
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-opacity hover:bg-white/20 disabled:pointer-events-none disabled:opacity-25';

  return (
    <div className="relative space-y-2.5">
      {/* Painel de cor livre (no lugar do seletor do sistema). */}
      <AnimatePresence>
        {customOpen ? (
          <motion.div
            key="custom-color"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute inset-x-0 bottom-full z-20 mb-2"
          >
            <CustomColorPanel
              value={current && /^#[0-9a-f]{6}$/i.test(current) ? current : '#ffffff'}
              onChange={(color) => onPick(color)}
              onClose={() => setCustomOpen(false)}
              ignoreRef={customButtonRef}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="flex flex-wrap justify-center gap-1.5">
        {COLOR_TARGETS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onTarget(item.key)}
            aria-pressed={target === item.key}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${target === item.key ? 'bg-white text-zinc-900' : 'bg-white/10 text-white/80 hover:bg-white/20'}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => scrollColors(-1)} disabled={!edges.left} aria-label="Cores anteriores" className={arrowClass}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div
        ref={rowRef}
        onScroll={updateEdges}
        className="flex min-w-0 flex-1 snap-x snap-mandatory scroll-px-1.5 items-center gap-2.5 overflow-x-auto px-1.5 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ WebkitMaskImage: fade, maskImage: fade }}
      >
        {target !== 'text' ? (
          <button
            type="button"
            onClick={() => onPick(null)}
            aria-label={target === 'background' ? 'Sem fundo' : target === 'outline' ? 'Sem borda' : 'Sem borda do fundo'}
            aria-pressed={!current}
            className={`relative h-8 w-8 shrink-0 snap-start overflow-hidden rounded-full border-2 bg-white/5 transition-transform ${!current ? 'scale-110 border-white' : 'border-white/40'}`}
          >
            <span className="absolute left-1/2 top-1/2 h-[2px] w-9 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-rose-300" aria-hidden="true" />
          </button>
        ) : null}
        {TEXT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onPick(color)}
            aria-label={`Cor ${color}`}
            aria-pressed={current?.toLowerCase() === color}
            className={`h-8 w-8 shrink-0 snap-start rounded-full border-2 transition-transform ${current?.toLowerCase() === color ? 'scale-110 border-white' : 'border-white/40'}`}
            style={{ backgroundColor: color }}
          />
        ))}
        {/* Cor livre: abre o painel de cores do editor. */}
        <button
          ref={customButtonRef}
          type="button"
          onClick={() => setCustomOpen((open) => !open)}
          aria-label="Outra cor"
          aria-expanded={customOpen}
          className={`relative h-8 w-8 shrink-0 snap-start rounded-full border-2 transition-transform ${
            (current && !isPreset) || customOpen ? 'scale-110 border-white' : 'border-white/40'
          }`}
          style={{ background: current && !isPreset ? current : 'conic-gradient(#ff5f5f, #ffd84d, #7ed957, #4dc9ff, #8a6bff, #ff5fd2, #ff5f5f)' }}
          title="Outra cor"
        >
          {current && !isPreset ? (
            <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-zinc-900" style={{ background: 'conic-gradient(#ff5f5f, #ffd84d, #7ed957, #4dc9ff, #8a6bff, #ff5fd2, #ff5f5f)' }} aria-hidden="true" />
          ) : null}
        </button>
      </div>
      <button type="button" onClick={() => scrollColors(1)} disabled={!edges.right} aria-label="Mais cores" className={arrowClass}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      </div>
      {(target === 'outline' || target === 'boxBorder') && current ? (
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-xs text-white/60">Grossura</span>
          <input
            type="range"
            min={BORDER_WIDTH_RANGE.min}
            max={BORDER_WIDTH_RANGE.max}
            step={0.005}
            value={width}
            onChange={(event) => onWidth(Number(event.target.value))}
            aria-label="Grossura da borda"
            className="h-1 flex-1 cursor-pointer accent-[#e7c88a]"
          />
          <span
            className="h-5 w-10 shrink-0 rounded-full"
            style={{ backgroundColor: current, transform: `scaleY(${0.15 + (width / BORDER_WIDTH_RANGE.max) * 0.85})` }}
            aria-hidden="true"
          />
        </div>
      ) : null}
    </div>
  );
}

// ---------- Painel de cor livre ----------
type Hsv = { h: number; s: number; v: number };

function hexToHsv(hex: string): Hsv {
  const value = parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hsvToHex({ h, s, v }: Hsv) {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    const channel = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(channel * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(5)}${f(3)}${f(1)}`;
}

/** Painel de cor no estilo do editor: quadrado de tom/brilho, barra de cores, código HEX e prévia. */
function CustomColorPanel({
  value,
  onChange,
  onClose,
  ignoreRef,
}: {
  value: string;
  onChange: (color: string) => void;
  onClose: () => void;
  ignoreRef: RefObject<HTMLElement>;
}) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [hexDraft, setHexDraft] = useState(value.toUpperCase());
  const panelRef = useRef<HTMLDivElement>(null);
  const hex = hsvToHex(hsv);

  // Cor escolhida pela paleta enquanto o painel está aberto: acompanha.
  useEffect(() => {
    if (value.toLowerCase() !== hsvToHex(hsv)) {
      setHsv(hexToHsv(value));
      setHexDraft(value.toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Fecha ao tocar fora (menos no botão que abre o painel).
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || ignoreRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [onClose, ignoreRef]);

  const apply = (next: Hsv) => {
    setHsv(next);
    const nextHex = hsvToHex(next);
    setHexDraft(nextHex.toUpperCase());
    onChange(nextHex);
  };

  /** Arrastar dentro de um elemento: devolve a posição em frações (0 a 1). */
  const dragOn = (event: ReactPointerEvent<HTMLDivElement>, handle: (x: number, y: number) => void) => {
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    const read = (clientX: number, clientY: number) => {
      const rect = element.getBoundingClientRect();
      handle(clamp((clientX - rect.left) / rect.width, 0, 1), clamp((clientY - rect.top) / rect.height, 0, 1));
    };
    read(event.clientX, event.clientY);
    const move = (moveEvent: PointerEvent) => read(moveEvent.clientX, moveEvent.clientY);
    const up = () => {
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
  };

  const commitHex = (text: string) => {
    const clean = text.trim().replace(/^#?/, '#');
    const full = /^#[0-9a-f]{3}$/i.test(clean) ? `#${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}` : clean;
    if (/^#[0-9a-f]{6}$/i.test(full)) apply(hexToHsv(full.toLowerCase()));
    else setHexDraft(hex.toUpperCase());
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Escolher outra cor"
      className="mx-auto max-w-sm space-y-3 rounded-2xl border border-white/10 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/70">Outra cor</p>
        <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-full px-2 py-0.5 text-sm text-white/70 hover:bg-white/10">
          ✕
        </button>
      </div>

      {/* Tom e brilho */}
      <div
        className="relative h-36 cursor-crosshair touch-none overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e7c88a]/60"
        style={{ backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }}
        onPointerDown={(event) => dragOn(event, (x, y) => apply({ ...hsv, s: x, v: 1 - y }))}
        role="slider"
        aria-label="Intensidade e brilho"
        aria-valuetext={hex}
        aria-valuenow={Math.round(hsv.s * 100)}
        tabIndex={0}
        onKeyDown={(event) => {
          const step = 0.04;
          const moves: Record<string, Partial<Hsv>> = {
            ArrowLeft: { s: clamp(hsv.s - step, 0, 1) },
            ArrowRight: { s: clamp(hsv.s + step, 0, 1) },
            ArrowUp: { v: clamp(hsv.v + step, 0, 1) },
            ArrowDown: { v: clamp(hsv.v - step, 0, 1) },
          };
          if (!moves[event.key]) return;
          event.preventDefault();
          apply({ ...hsv, ...moves[event.key] });
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black to-transparent" />
        <span
          className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35),0_2px_6px_rgba(0,0,0,0.4)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: hex }}
        />
      </div>

      {/* Barra de cores */}
      <div
        className="relative mx-2.5 h-4 cursor-pointer touch-none rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e7c88a]/60"
        style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
        onPointerDown={(event) => dragOn(event, (x) => apply({ ...hsv, h: Math.min(359.9, x * 360) }))}
        role="slider"
        aria-label="Cor"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          apply({ ...hsv, h: clamp(hsv.h + (event.key === 'ArrowRight' ? 6 : -6), 0, 359.9) });
        }}
      >
        <span
          className="pointer-events-none absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35),0_2px_6px_rgba(0,0,0,0.4)]"
          style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }}
        />
      </div>

      {/* Prévia e código */}
      <div className="flex items-center gap-2.5">
        <span className="h-9 w-9 shrink-0 rounded-full border-2 border-white/60 shadow-inner" style={{ backgroundColor: hex }} aria-hidden="true" />
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white/10 px-3 py-2 focus-within:ring-2 focus-within:ring-[#e7c88a]/50">
          <span className="text-xs font-medium text-white/50">HEX</span>
          <input
            value={hexDraft}
            onChange={(event) => setHexDraft(event.target.value.toUpperCase().slice(0, 7))}
            onBlur={(event) => commitHex(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitHex(event.currentTarget.value);
              }
            }}
            spellCheck={false}
            autoCapitalize="characters"
            aria-label="Código da cor (HEX)"
            className="min-w-0 flex-1 bg-transparent font-mono text-sm uppercase tracking-wider text-white focus:outline-none"
          />
        </label>
        <button type="button" onClick={onClose} className="shrink-0 rounded-full bg-champagne-600 px-4 py-2 text-xs font-medium text-[#fff9f1]">
          Pronto
        </button>
      </div>
    </div>
  );
}
