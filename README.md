# AuraCut - CRF Video Processing Engine

AuraCut is a premium, high-fidelity browser-based video editing suite designed to strip out Constant Rate Factor (CRF) profiles and modify digital video signatures. Built entirely using WebGL, Web Audio API, WebCodecs, and HTML5 Canvas, it operates 100% locally in the browser with zero server latency.

## 🚀 Key Features

* **Constant Rate Factor (CRF) Modification**:
  * **Frame Dropping**: Dynamically skips 1 out of every 5 visual frames, converting standard 30Hz videos to 24Hz visual frequency.
  * **Continuous Playback Velocity Jitter**: Fluctuates audio playback velocity continuously between `0.01x` and `0.10x` delta to alter audio patterns.
  * **Color Profile Hue Shifts**: Applies an imperceptible, microscopic `0.1%` hue matrix change via hardware-accelerated SVG matrix filters.
  * **Jirjir (TV Static) Analog Noise**: Adds customizable static noise overlay directly to pixel grids to physically modify compression profiles.

* **Forensic Metadata Inspection Table**:
  * Compares original input vs. processed output side-by-side.
  * **Full hashes and signatures displayed**: Shows complete 64-character SHA-256 hashes and 40-character SHA-1 signatures.
  * **Frequencies**: Displays FPS (30Hz vs 24Hz) and audio sample rate resampling (44.1kHz vs 48kHz).
  * **Specs**: Tracks aspect ratio (computed dynamically), channel layouts, total audio samples, playhead speeds, and timestamps.

* **100% Self-Contained**:
  * Packages all library dependencies locally (`mp4-muxer.js`).
  * Runs entirely in local sandboxes without hitting external APIs, meaning it works offline.

---

## 📂 Project Structure

```
├── index.html        # Main dashboard layout
├── style.css         # Styling and dark-mode design tokens
├── app.js            # Video processing logic
├── mp4-muxer.js      # Local video muxer dependency
├── vercel.json       # Vercel deployment headers and url configurations
└── .gitignore        # Git ignore rules
```

---

## ⚡ Deployment & Hosting

### 1. Host on Vercel
This repository is pre-configured with a `vercel.json` file.
1. Create a repository on GitHub.
2. Push this folder to your GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin YOUR_REPO_URL
   git push -u origin main
   ```
3. Import the repository into [Vercel](https://vercel.com) and click **Deploy**. Vercel will automatically host the static website.

### 2. Run Locally
You can double-click `index.html` to run the website directly via the `file://` protocol. The FNV-1a hash generator acts as a fallback to ensure SHA-256 and SHA-1 signatures compute even when browser security rules disable native `crypto.subtle` APIs locally.
