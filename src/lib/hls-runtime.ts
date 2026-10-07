export type HlsLevelInfo = {
  index: number;
  label: string;
  width?: number;
  height?: number;
  bitrate?: number;
  codecs?: string;
};

type HlsLevelRaw = {
  width?: number;
  height?: number;
  bitrate?: number;
  averageBitrate?: number;
  videoCodec?: string;
  audioCodec?: string;
  name?: string;
};

export type HlsInstanceLike = {
  levels: HlsLevelRaw[];
  currentLevel: number;
  nextLevel: number;
  autoLevelEnabled?: boolean;
  loadSource: (url: string) => void;
  attachMedia: (video: HTMLMediaElement) => void;
  destroy: () => void;
  startLoad: () => void;
  recoverMediaError: () => void;
  on: (event: string, handler: (event: string, data: unknown) => void) => void;
};

export type HlsConstructorLike = {
  new (config?: Record<string, unknown>): HlsInstanceLike;
  isSupported: () => boolean;
  Events: {
    MANIFEST_PARSED: string;
    LEVEL_SWITCHED: string;
    ERROR: string;
  };
  ErrorTypes?: {
    NETWORK_ERROR?: string;
    MEDIA_ERROR?: string;
  };
};

declare global {
  interface Window {
    Hls?: HlsConstructorLike;
    __cinemaHlsPromise?: Promise<HlsConstructorLike | null>;
  }
}

const HLS_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js";

export function loadHlsLibrary(): Promise<HlsConstructorLike | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.Hls) return Promise.resolve(window.Hls);
  if (window.__cinemaHlsPromise) return window.__cinemaHlsPromise;

  window.__cinemaHlsPromise = new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-cinema-hls="true"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Hls ?? null), { once: true });
      existing.addEventListener("error", () => resolve(null), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = HLS_SCRIPT_URL;
    script.async = true;
    script.dataset.cinemaHls = "true";
    script.onload = () => resolve(window.Hls ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return window.__cinemaHlsPromise;
}

export function normalizeHlsLevels(levels: HlsLevelRaw[]): HlsLevelInfo[] {
  return levels.map((level, index) => {
    const height = level.height || undefined;
    const width = level.width || undefined;
    const bitrate = level.averageBitrate || level.bitrate || undefined;
    const codecs = [level.videoCodec, level.audioCodec].filter(Boolean).join(" + ") || undefined;
    const label = level.name || (height ? `${height}p${width ? ` • ${width}×${height}` : ""}` : `جودة ${index + 1}`);
    return { index, label, width, height, bitrate, codecs };
  });
}
