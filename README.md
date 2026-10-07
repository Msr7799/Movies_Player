# Cinema Player

A modern, privacy-friendly movie player built with Next.js. Cinema Player can play movies selected directly from your device, discover videos from a self-hosted library, and work with browser-compatible direct video URLs through its reusable player source model.

It provides a responsive cinematic interface with quality selection, playback speed, subtitles, fullscreen, Picture-in-Picture, zoom, keyboard shortcuts, and remembered playback progress.

## Features

- Play movies directly from a computer, phone, or tablet.
- Keep device-selected movies local; the application does not upload them.
- Automatically discover movies stored in the local media library.
- Support direct HTTP or HTTPS video sources through `Movie.sources`.
- Group several resolutions of the same movie into quality options.
- Load SRT and VTT subtitles.
- Customize subtitle size, color, weight, position, background, opacity, and shadow.
- Remember playback progress and subtitle appearance in the browser.
- Search the movie library.
- Understand movie names in Arabic, English, and other languages with Gemini.
- Switch between Tavily deep search and Serper Google search, returning up to five verified legal sources.
- Exclude trailers, excerpts, scenes, and other short videos by default.
- Optionally allow short clips and trailers from the search filters.
- Use a responsive Arabic-first interface on desktop and mobile.

## AI Movie Discovery

The **AI Movie Search** panel accepts a movie or video title in any language. After at least three characters, a debounced Gemini-powered suggestions list offers up to six likely titles without replacing the user's text automatically. Gemini then identifies the selected title, original title, likely year, and useful aliases. The viewer can switch between Tavily and Serper before searching; the selected provider runs the web searches and Gemini ranks the real results so the interface shows a maximum of five legal sources.

The viewer can filter by movie language or cinema—including Arabic, English, Indian, Turkish, Korean, Japanese, French, Spanish, and other world cinema—and can request a preferred subtitle language. These preferences influence Gemini title disambiguation, the selected search provider's queries, and final result ranking. Subtitle availability is never invented; when a provider does not expose clear evidence, the viewer is told to verify availability on that service because languages can vary by account region.

Search is restricted to known legitimate platforms, official video services, licensed streaming availability pages, and public-domain archives. The API does not search torrent sites, piracy mirrors, access bypasses, or unauthorized streaming servers.

Full-length viewing is the default search mode. Results are limited to sources with explicit evidence of a complete movie and legitimate pages that show where the full title can be watched. Ambiguous hosted videos, trailers, teasers, scenes, songs, reviews, and other excerpts are excluded even when this produces fewer than five results. Viewers can opt in to those shorter results with the **Allow short clips and trailers** filter; each result is visibly labeled as a full movie, viewing page, or short clip.

Create a local `.env` file using `.env.example`:

```bash
TAVILY_API_KEY=your_server_key
SERPER_API_KEY=your_server_key
GEMINI_API_KEY=your_server_key
GEMINI_AUTO_SUGGESTED_API_KEY=your_second_server_key
```

These values are read only by server-side routes. `/api/discover` uses `GEMINI_API_KEY` plus either `TAVILY_API_KEY` or `SERPER_API_KEY`, based on the switch in the search panel. `/api/suggest` exclusively uses `GEMINI_AUTO_SUGGESTED_API_KEY` so typing suggestions do not consume the main search key's quota. Never rename them with a `NEXT_PUBLIC_` prefix. On Vercel, add the same variables under **Project Settings → Environment Variables** and redeploy.

Direct media files and supported YouTube, Vimeo, or Internet Archive results can play inside Cinema Player. Other services open their official page because subscription, region, sign-in, DRM, and embedding rules are controlled by each provider.

## Playback Sources

### Open a movie from your device

Start the website and select **Open File**. You can choose a video by itself or select the video together with one or more `.srt` or `.vtt` subtitle files.

The browser creates temporary local URLs for the selected files. The movie stays on your device and is not uploaded to the application server.

### Add movies to the built-in library

Place video files inside:

```text
public/assets/videos/
```

Refresh the page after adding files. Cinema Player scans the folder and displays supported movies in the library sidebar.

Supported library extensions:

```text
.mp4  .webm  .mov  .m4v  .ogg
```

Playback compatibility depends on the codecs supported by the viewer's browser. MP4 files using H.264 video and AAC audio usually provide the widest browser compatibility.

### Play a movie URL

Select **Open URL** in the website header, paste the movie URL, optionally enter a title, and select **Play URL**. Direct MP4 and WebM links use Cinema Player's full controls. VK `video_ext.php` links open inside the VK embedded player and use VK's playback controls.

The reusable `VideoPlayer` also accepts remote sources programmatically through the `Movie.sources` model. It can be connected to a CDN, media server, object storage service, or another authorized media source. Set `kind` to `"embed"` for a supported embedded player URL; regular direct media sources use `"video"` or omit the field.

```tsx
import type { Movie } from "@/lib/media-types";
import { VideoPlayer } from "@/components/video-player";

const remoteMovie: Movie = {
  id: "remote-movie",
  title: "Remote Movie",
  sources: [
    {
      quality: "1080p",
      url: "https://media.example.com/movie-1080p.mp4",
      size: 0,
    },
    {
      quality: "720p",
      url: "https://media.example.com/movie-720p.mp4",
      size: 0,
    },
  ],
  subtitles: [
    {
      label: "English",
      language: "en",
      url: "https://media.example.com/movie.en.vtt",
    },
  ],
};

export function RemoteMoviePlayer() {
  return <VideoPlayer movie={remoteMovie} onOpenFiles={() => {}} />;
}
```

The URL must point directly to a browser-playable media file—not to a normal webpage or a streaming-site watch page. For reliable playback and seeking, the remote server should:

- Return the correct media `Content-Type`.
- Support HTTP byte-range requests.
- Allow access from the website where cross-origin permission is required.
- Permit cross-origin fetching for remote subtitle files.

## Player Controls

Cinema Player includes:

- Play and pause.
- A seek bar with elapsed and total time.
- Skip backward or forward by 10 seconds.
- Volume adjustment and mute.
- Playback speeds from `0.5x` to `2x`.
- Quality switching while preserving the playback position.
- Video zoom from `100%` to `160%`.
- **Contain** and **Cover** display modes.
- Fullscreen mode and double-click fullscreen.
- Picture-in-Picture when supported by the browser.
- A download action when allowed by the source.
- Subtitle selection and appearance controls.

### Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `Space` or `K` | Play or pause |
| `J` or `Left Arrow` | Go back 10 seconds |
| `L` or `Right Arrow` | Go forward 10 seconds |
| `M` | Mute or restore audio |
| `F` | Enter or leave fullscreen |
| `C` | Enable or disable subtitles |

## Multiple Quality Files

Use the same movie name followed by a resolution suffix. Cinema Player groups matching files into one library entry:

```text
public/assets/videos/My Movie-1080p.mp4
public/assets/videos/My Movie-720p.mp4
public/assets/videos/My Movie-480p.mp4
```

Recognized quality labels are `2160p`, `1440p`, `1080p`, `720p`, `480p`, and `360p`.

## Subtitles

Place SRT or VTT files in `public/assets/subtitles`. A subtitle filename must begin with the matching movie name:

```text
public/assets/subtitles/My Movie.ar.srt
public/assets/subtitles/My Movie.en.vtt
```

Recognized language suffixes:

| Suffix | Language |
| --- | --- |
| `ar` | Arabic |
| `en` | English |
| `fr` | French |
| `es` | Spanish |
| `tr` | Turkish |

Subtitle appearance preferences are saved in browser local storage.

## Movie Posters

Add a poster with the same base name as the movie:

```text
public/assets/posters/My Movie.jpg
```

Supported poster formats are JPEG, PNG, and WebP.

## Getting Started

### Requirements

- Node.js `20.9.0` or newer.
- pnpm `10.33.0` or a compatible pnpm version.

### Install and Run

```bash
git clone https://github.com/Msr7799/Movies_Player.git
cd Movies_Player
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production

```bash
pnpm build
pnpm start
```

### Lint

```bash
pnpm lint
```

## Project Structure

```text
src/
  app/
    api/library/route.ts     Scans the local media library
    globals.css              Global styles
    layout.tsx               Application layout
    page.tsx                 Main page
  components/
    cinema-app.tsx           Library and file-selection interface
    video-player.tsx         Player controls and subtitle renderer
  lib/
    media-types.ts           Movie, source, and subtitle types
public/
  assets/
    videos/                  Local library video files
    subtitles/               SRT and VTT subtitle files
    posters/                 Movie artwork
```

## Privacy and Storage

- Movies opened through the file picker remain on the viewer's device.
- Playback progress and subtitle preferences are stored in that browser's local storage.
- The application does not include accounts, analytics, or an upload service.
- Files placed inside `public/assets` are publicly served by the running website. Do not place private media there on a public deployment.
- Local files under `public/assets/videos` are ignored by Git to prevent large movies from being committed accidentally.

## Technology

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Lucide React

## Responsible Use

Only play or host media that you own or are authorized to access. Direct-link playback is subject to the source server's permissions, browser security rules, and applicable copyright laws.

## HLS Playback

The URL dialog also accepts authorized HLS playlists ending in `.m3u8`. Cinema Player loads `hls.js` in the browser when native HLS playback is unavailable, reads the master playlist, exposes discovered quality levels, and shows technical media details such as resolution, bitrate, codecs, duration, source host, and playback errors.

You can optionally add a remote thumbnail URL when opening a movie URL. The thumbnail, movie metadata, current playback position, and HLS details are stored in the browser's **Recently Watched** history. History can be searched from the sidebar and cleared at any time.

Some HLS URLs are signed or temporary. If a token expires, or if the media server does not allow the Cinema Player origin through CORS, the player will show the network error but will not bypass the source server's access controls.
