"use client";

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Portal } from '@/components/home/portal';

// Editor de fotos do mural, no estilo do Instagram:
// - enquadrar: formato (original, 1:1, 4:5, 16:9), arrastar a foto para posicionar e zoom (pinça, rolagem ou barra);
// - texto por cima da foto: escrever, arrastar para qualquer lugar, cor, estilo, fundo e tamanho.
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
  style: 'classic' | 'simple';
  background: boolean;
};
export type PhotoEditState = {
  aspect: PhotoAspect;
  zoom: number;
  /** Deslocamento do centro da foto, em fração da largura/altura do quadro. */
  offsetX: number;
  offsetY: number;
  texts: PhotoTextLayer[];
};
export type PhotoEditResult = { blob: Blob; width: number; height: number; state: PhotoEditState };
/** Recorte de vídeo em frações do quadro original (0 a 1): o Cloudinary aplica ao processar o vídeo. */
export type VideoCrop = { x: number; y: number; w: number; h: number };
export type VideoCropResult = { crop: VideoCrop | null; width: number; height: number; state: PhotoEditState };

export const DEFAULT_PHOTO_EDIT: PhotoEditState = { aspect: 'original', zoom: 1, offsetX: 0, offsetY: 0, texts: [] };

const ASPECTS: { key: PhotoAspect; label: string; ratio: number | null }[] = [
  { key: 'original', label: 'Original', ratio: null },
  { key: '1:1', label: '1:1', ratio: 1 },
  { key: '4:5', label: '4:5', ratio: 4 / 5 },
  { key: '16:9', label: '16:9', ratio: 16 / 9 },
];
// Cores do site: branco, preto, rosé, champanhe, oliva e dourado.
const TEXT_COLORS = ['#ffffff', '#1f1b16', '#c97a8a', '#8a5a2b', '#617541', '#e2b85f'];
const MAX_ZOOM = 4;
const MAX_OUTPUT = 2048;
const LINE_HEIGHT = 1.15;
const DEFAULT_TEXT_SIZE = 0.075;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const newId = () => Math.random().toString(36).slice(2, 10);

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
      if (editingId) setEditingId(null);
      else if (!isSaving) onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [editingId, isSaving, onCancel]);

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
    const layer: PhotoTextLayer = { id: newId(), text: '', x: 0.5, y: 0.5, size: DEFAULT_TEXT_SIZE, color: '#ffffff', style: 'classic', background: false };
    setState((value) => ({ ...value, texts: [...value.texts, layer] }));
    setSelectedId(layer.id);
    setEditingId(layer.id);
  };

  const removeText = (id: string) => {
    setState((value) => ({ ...value, texts: value.texts.filter((item) => item.id !== id) }));
    setSelectedId(null);
    setEditingId(null);
  };

  const finishEditing = () => {
    if (editing && !editing.text.trim()) removeText(editing.id);
    else setEditingId(null);
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
    if (!drag.moved) setEditingId(drag.id);
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

      const classicFamily = fontFamilyOf('font-display');
      const simpleFamily = fontFamilyOf('font-sans');
      for (const layer of texts) {
        if (!layer.text.trim()) continue;
        const fontSize = layer.size * frameWidth * k;
        const font = layer.style === 'classic' ? `italic 400 ${fontSize}px ${classicFamily}` : `600 ${fontSize}px ${simpleFamily}`;
        try {
          await document.fonts?.load(font, layer.text);
        } catch {
          // segue com a fonte que estiver disponível
        }
        context.font = font;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        const lines = layer.text.split('\n');
        const lineHeight = fontSize * LINE_HEIGHT;
        const blockHeight = lineHeight * lines.length;
        const centerX = layer.x * outWidth;
        const centerY = layer.y * outHeight;
        if (layer.background) {
          const width = Math.max(...lines.map((line) => context.measureText(line).width));
          const padX = fontSize * 0.6;
          const padY = fontSize * 0.35;
          context.fillStyle = layer.color;
          context.beginPath();
          const x = centerX - width / 2 - padX;
          const y = centerY - blockHeight / 2 - padY;
          const w = width + padX * 2;
          const h = blockHeight + padY * 2;
          const radius = fontSize * 0.4;
          if (typeof context.roundRect === 'function') context.roundRect(x, y, w, h, radius);
          else context.rect(x, y, w, h);
          context.fill();
          context.fillStyle = contrastOn(layer.color);
          context.shadowColor = 'transparent';
        } else {
          context.fillStyle = layer.color;
          context.shadowColor = 'rgba(0,0,0,0.5)';
          context.shadowBlur = fontSize * 0.12;
          context.shadowOffsetY = fontSize * 0.03;
        }
        lines.forEach((line, index) => {
          context.fillText(line, centerX, centerY - blockHeight / 2 + lineHeight * (index + 0.5));
        });
        context.shadowColor = 'transparent';
        context.shadowBlur = 0;
        context.shadowOffsetY = 0;
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

              {texts.map((layer) =>
                layer.id === editingId ? null : (
                  <div
                    key={layer.id}
                    className={`absolute cursor-move touch-none whitespace-pre text-center ${layer.style === 'classic' ? 'font-display italic' : 'font-sans font-semibold'} ${
                      layer.id === selectedId ? 'outline outline-1 outline-offset-4 outline-white/70' : ''
                    }`}
                    style={{
                      left: layer.x * frameWidth,
                      top: layer.y * frameHeight,
                      transform: 'translate(-50%, -50%)',
                      fontSize: layer.size * frameWidth,
                      lineHeight: LINE_HEIGHT,
                      color: layer.background ? contrastOn(layer.color) : layer.color,
                      backgroundColor: layer.background ? layer.color : 'transparent',
                      padding: layer.background ? '0.35em 0.6em' : 0,
                      borderRadius: layer.background ? '0.4em' : 0,
                      textShadow: layer.background ? 'none' : '0 0.03em 0.12em rgba(0,0,0,0.5)',
                    }}
                    onPointerDown={(event) => onTextPointerDown(event, layer)}
                    onPointerMove={onTextPointerMove}
                    onPointerUp={onTextPointerUp}
                    onPointerCancel={onTextPointerUp}
                  >
                    {layer.text}
                  </div>
                )
              )}
            </div>
          ) : null}
        </div>

        {/* Ferramentas */}
        <div className="space-y-3 px-4 pb-4 pt-3">
          {selected && !editing ? (
            <div className="flex items-center justify-center gap-2 text-xs">
              <button type="button" onClick={() => setEditingId(selected.id)} className="rounded-full bg-white/10 px-3 py-1.5 hover:bg-white/20">
                Editar texto
              </button>
              <button type="button" onClick={() => removeText(selected.id)} className="rounded-full bg-rose-500/20 px-3 py-1.5 text-rose-100 hover:bg-rose-500/30">
                Remover texto
              </button>
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
            {/* Texto por cima: só nas fotos (no vídeo, o editor só recorta). */}
            {!isVideo ? (
              <button type="button" onClick={addText} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
                <span className="font-display text-lg italic leading-none">Aa</span> Texto
              </button>
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
        </div>

        {/* Escrevendo um texto */}
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
              <div className="flex items-center justify-between px-4 py-3">
                <button type="button" onClick={() => removeText(editing.id)} className="rounded-full px-3 py-2 text-sm text-rose-200 hover:bg-white/10">
                  Remover
                </button>
                <div className="flex gap-1.5">
                  {(['classic', 'simple'] as const).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => updateText(editing.id, { style })}
                      aria-pressed={editing.style === style}
                      className={`rounded-full px-3 py-1.5 text-xs ${editing.style === style ? 'bg-white text-zinc-900' : 'bg-white/10 text-white/80'} ${
                        style === 'classic' ? 'font-display text-sm italic' : 'font-semibold'
                      }`}
                    >
                      {style === 'classic' ? 'Clássico' : 'Simples'}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => updateText(editing.id, { background: !editing.background })}
                    aria-pressed={editing.background}
                    aria-label="Fundo no texto"
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${editing.background ? 'bg-white text-zinc-900' : 'bg-white/10 text-white'}`}
                  >
                    A
                  </button>
                </div>
                <button type="button" onClick={finishEditing} className="rounded-full bg-champagne-600 px-4 py-2 text-sm font-medium text-[#fff9f1]">
                  Pronto
                </button>
              </div>

              <div className="flex min-h-0 flex-1 items-center justify-center px-6">
                <textarea
                  autoFocus
                  value={editing.text}
                  onChange={(event) => updateText(editing.id, { text: event.target.value.slice(0, 120) })}
                  rows={3}
                  placeholder="Escreva algo…"
                  className={`w-full max-w-md resize-none bg-transparent text-center placeholder:text-white/40 focus:outline-none ${
                    editing.style === 'classic' ? 'font-display italic' : 'font-sans font-semibold'
                  }`}
                  style={{
                    fontSize: clamp(editing.size * 420, 18, 44),
                    lineHeight: LINE_HEIGHT,
                    color: editing.background ? contrastOn(editing.color) : editing.color,
                    backgroundColor: editing.background ? editing.color : 'transparent',
                    borderRadius: '0.4em',
                    textShadow: editing.background ? 'none' : '0 0.03em 0.12em rgba(0,0,0,0.5)',
                  }}
                />
              </div>

              <div className="space-y-4 px-4 pb-5">
                <div className="mx-auto flex max-w-md items-center gap-3">
                  <span className="text-xs text-white/60">A</span>
                  <input
                    type="range"
                    min={0.04}
                    max={0.16}
                    step={0.005}
                    value={editing.size}
                    onChange={(event) => updateText(editing.id, { size: Number(event.target.value) })}
                    aria-label="Tamanho do texto"
                    className="h-1 flex-1 cursor-pointer accent-[#e7c88a]"
                  />
                  <span className="text-lg text-white/60">A</span>
                </div>
                <div className="flex items-center justify-center gap-3">
                  {TEXT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => updateText(editing.id, { color })}
                      aria-label={`Cor ${color}`}
                      aria-pressed={editing.color === color}
                      className={`h-8 w-8 rounded-full border-2 transition-transform ${editing.color === color ? 'scale-110 border-white' : 'border-white/40'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </Portal>
  );
}
