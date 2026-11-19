// Som do selo de cera quebrando, gerado na hora pelo navegador (Web Audio): não baixa nenhum arquivo.
// Camadas: "snap" seco quando a rachadura aparece, estalinhos enquanto ela corre, um segundo estalo quando o
// selo se parte e tiquinhos bem baixos das lascas caindo no papel. Os tempos seguem a animação do envelope.

/** Evento para a música de fundo abaixar por um momento (detail: quanto tempo segurar, em ms). */
export const MUSIC_DUCK_EVENT = 'igor-bianca:duck';

/** Volume geral do estalo, calibrado contra a música de fundo no volume padrão do player (25%):
 *  ~5 dB acima da música normal e ~15 dB acima dela abaixada, com picos controlados pelo compressor. */
const MASTER_GAIN = 0.78;

// Gerador pseudoaleatório com semente fixa: o estalo soa sempre igual.
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function noiseBuffer(context: BaseAudioContext) {
  const random = seeded(7);
  const buffer = context.createBuffer(1, Math.round(context.sampleRate * 0.5), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = random() * 2 - 1;
  return buffer;
}

/** Monta o estalo no contexto a partir do instante `start` (em segundos do contexto). */
export function scheduleSealCrack(context: BaseAudioContext, destination: AudioNode, start: number) {
  const noise = noiseBuffer(context);
  const random = seeded(42);

  // Compressor leve: segura os picos para o estalo não "estourar" em nenhum alto-falante.
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 8;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.12;
  const master = context.createGain();
  master.gain.value = MASTER_GAIN;
  compressor.connect(master);
  master.connect(destination);

  // Rajada de ruído filtrada com ataque instantâneo e queda exponencial.
  const burst = (at: number, length: number, peak: number, frequency: number, q: number, type: BiquadFilterType = 'bandpass') => {
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.0015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(compressor);
    source.start(at, random() * 0.4, length + 0.02);
  };

  // Batida grave curta (o corpo da cera cedendo).
  const thump = (at: number, peak: number) => {
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(170, at);
    oscillator.frequency.exponentialRampToValueAtTime(70, at + 0.09);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
    oscillator.connect(gain);
    gain.connect(compressor);
    oscillator.start(at);
    oscillator.stop(at + 0.13);
  };

  // 1. Rachadura aparece (a animação começa a desenhar a fenda em ~0,12 s).
  const crack = start + 0.12;
  burst(crack, 0.012, 0.9, 4200, 0.7, 'highpass');
  burst(crack + 0.002, 0.07, 0.55, 1900, 1.1);
  thump(crack, 0.35);
  // 2. Estalinhos enquanto a fenda corre para os lados.
  for (let i = 0; i < 7; i += 1) {
    const at = crack + 0.03 + i * 0.038 + random() * 0.018;
    burst(at, 0.01 + random() * 0.012, 0.18 + random() * 0.22, 2600 + random() * 2600, 1.4);
  }
  // 3. O selo se parte (tremida da animação).
  const split = start + 0.48;
  burst(split, 0.01, 0.6, 3600, 0.8, 'highpass');
  burst(split + 0.003, 0.05, 0.35, 1500, 1.2);
  thump(split, 0.2);
  // 4. Lascas caindo no papel: tiquinhos bem baixos.
  for (let i = 0; i < 5; i += 1) {
    const at = start + 0.62 + i * 0.09 + random() * 0.05;
    burst(at, 0.008, 0.06 + random() * 0.05, 5000 + random() * 2500, 2);
  }
  return start + 1.1;
}

let sharedContext: AudioContext | null = null;
let suspendTimer = 0;

/** Toca o estalo (chamar no toque da pessoa) e pede para a música de fundo abaixar por um momento. */
export function playSealCrack() {
  try {
    window.dispatchEvent(new CustomEvent(MUSIC_DUCK_EVENT, { detail: 1300 }));
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    sharedContext ??= new AudioContextClass();
    const context = sharedContext;
    if (context.state === 'suspended') void context.resume();
    const end = scheduleSealCrack(context, context.destination, context.currentTime + 0.01);
    // Terminado o estalo, o contexto de áudio é suspenso (não fica gastando processamento/bateria à toa).
    window.clearTimeout(suspendTimer);
    suspendTimer = window.setTimeout(() => void context.suspend().catch(() => undefined), (end - context.currentTime + 0.3) * 1000);
  } catch {
    // Sem áudio no navegador: a animação segue em silêncio.
  }
}
