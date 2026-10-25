type FittedTextProps = {
  text: string;
  className?: string;
  /** Tamanho da fonte dentro do viewBox de 800 de largura; o SVG escala para a largura do bloco. */
  fontSize?: number;
};

// Texto em SVG que estica junto com a largura do container (títulos grandes da Cordially).
export function FittedText({ text, className, fontSize = 124 }: FittedTextProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 800 160" className={`h-auto w-full overflow-visible ${className ?? ''}`}>
      <text
        x="400"
        y="54%"
        dominantBaseline="middle"
        textAnchor="middle"
        fill="currentColor"
        className="font-display italic"
        style={{ fontSize }}
      >
        {text}
      </text>
    </svg>
  );
}
