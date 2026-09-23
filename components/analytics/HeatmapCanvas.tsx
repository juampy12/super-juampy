"use client";

import { useEffect, useMemo, useRef } from "react";
import type { HeatmapRow } from "@/lib/analytics/types";
import { isValidHeatmap } from "@/lib/analytics/validateHeatmap";
import { formatAge } from "@/lib/analytics/formatAge";

interface Props {
  heatmap: HeatmapRow | null;
  /** Imagen de fondo opcional: un plano del local o un frame de la cámara. */
  backgroundUrl?: string;
  height?: number;
  /** Antigüedad en vivo de `heatmap`, calculada por el servidor. */
  ageSeconds?: number | null;
}

/**
 * Dibuja la grilla de calor (0..1) sobre un canvas con una rampa térmica y
 * suavizado bilineal. La grilla es baja resolución (ej. 64x48): el canvas la
 * escala e interpola para que se vea continua. Si la grilla no tiene la forma
 * esperada (cols/rows fuera de rango, o no coincide con el tamaño real) no se
 * dibuja: mejor un aviso que un canvas roto o datos engañosos.
 */
export function HeatmapCanvas({ heatmap, backgroundUrl, height = 300, ageSeconds = null }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const valid = useMemo(() => (heatmap && isValidHeatmap(heatmap) ? heatmap : null), [heatmap]);
  const corrupt = !!heatmap && !valid;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = (bg?: HTMLImageElement) => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      if (bg) {
        ctx.globalAlpha = 0.5;
        ctx.drawImage(bg, 0, 0, W, H);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = "#0b1220";
        ctx.fillRect(0, 0, W, H);
      }

      if (!valid) return;

      const { grid, cols, rows } = valid;
      // Render en un canvas chico y luego escalado con suavizado.
      const small = document.createElement("canvas");
      small.width = cols;
      small.height = rows;
      const sctx = small.getContext("2d")!;
      const img = sctx.createImageData(cols, rows);

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const v = clamp01(grid[y]?.[x] ?? 0);
          const [r, g, b, a] = thermal(v);
          const i = (y * cols + x) * 4;
          img.data[i] = r;
          img.data[i + 1] = g;
          img.data[i + 2] = b;
          img.data[i + 3] = a;
        }
      }
      sctx.putImageData(img, 0, 0);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.globalAlpha = 0.8;
      ctx.drawImage(small, 0, 0, cols, rows, 0, 0, W, H);
      ctx.globalAlpha = 1;
    };

    if (backgroundUrl) {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => draw(image);
      image.onerror = () => draw();
      image.src = backgroundUrl;
    } else {
      draw();
    }
  }, [valid, backgroundUrl]);

  return (
    <div className="card">
      <div className="head">
        <h3>Mapa de calor de circulación</h3>
        {valid && ageSeconds != null ? <span className="age">actualizado {formatAge(ageSeconds)}</span> : null}
      </div>
      <canvas ref={canvasRef} width={800} height={height} className="hm" />
      {corrupt ? (
        <p className="warn">⚠️ El mapa de calor recibido no tiene una forma válida — no se muestra.</p>
      ) : (
        <p className="legend">
          <span className="dot cold" /> Menos tránsito
          <span className="bar" />
          <span className="dot hot" /> Más tránsito
        </p>
      )}
      <style jsx>{`
        .card {
          background: var(--card, #fff);
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 14px;
          padding: 18px 20px;
        }
        .head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 8px;
          margin: 0 0 12px;
        }
        h3 {
          margin: 0;
          font-size: 15px;
          color: var(--fg, #111827);
        }
        .age {
          font-size: 11px;
          color: var(--muted, #6b7280);
        }
        .hm {
          width: 100%;
          height: auto;
          border-radius: 10px;
          display: block;
        }
        .legend {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 12px 0 0;
          font-size: 12px;
          color: var(--muted, #6b7280);
        }
        .warn {
          margin: 12px 0 0;
          font-size: 12px;
          color: #cc2020;
        }
        .dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          display: inline-block;
        }
        .cold {
          background: #1e3a8a;
        }
        .hot {
          background: #ef4444;
        }
        .bar {
          flex: 0 0 80px;
          height: 8px;
          border-radius: 4px;
          background: linear-gradient(90deg, #1e3a8a, #06b6d4, #eab308, #ef4444);
        }
      `}</style>
    </div>
  );
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Rampa térmica azul -> cian -> amarillo -> rojo, con alfa creciente. */
function thermal(v: number): [number, number, number, number] {
  if (v < 0.02) return [0, 0, 0, 0]; // transparente donde no hubo tránsito
  const stops: Array<[number, number, number, number]> = [
    [0.0, 30, 58, 138],
    [0.35, 6, 182, 212],
    [0.7, 234, 179, 8],
    [1.0, 239, 68, 68],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, r0, g0, b0] = stops[i];
    const [p1, r1, g1, b1] = stops[i + 1];
    if (v >= p0 && v <= p1) {
      const t = (v - p0) / (p1 - p0);
      return [
        Math.round(r0 + (r1 - r0) * t),
        Math.round(g0 + (g1 - g0) * t),
        Math.round(b0 + (b1 - b0) * t),
        Math.round(120 + 135 * v),
      ];
    }
  }
  return [239, 68, 68, 255];
}
