# ComfyGUI

<p align="center">
  <img src="src/assets/comfygui-logo.png" alt="ComfyGUI Logo" width="120" onerror="this.style.display='none'"/>
</p>

<p align="center">
  <strong>A modern, high-performance standalone desktop studio and process launcher for ComfyUI.</strong>
</p>

<p align="center">
  <a href="https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.33.1"><img src="https://img.shields.io/badge/ComfyUI-%3E%3D%20v0.33.1-blue.svg?style=flat-square" alt="ComfyUI >= v0.33.1"/></a>
  <img src="https://img.shields.io/badge/Tauri-v2-orange.svg?style=flat-square" alt="Tauri v2"/>
  <img src="https://img.shields.io/badge/Vue-v3-emerald.svg?style=flat-square" alt="Vue 3"/>
  <img src="https://img.shields.io/badge/TailwindCSS-v4-38bdf8.svg?style=flat-square" alt="Tailwind CSS v4"/>
  <img src="https://img.shields.io/badge/License-GPLv3-blue.svg?style=flat-square" alt="License"/>
</p>

## Overview

**ComfyGUI** is a dedicated desktop client, studio interface, and process launcher built with **Tauri v2**, **Vue 3**, and **Rust**. It eliminates the complexity of navigating large node graphs for everyday image generation by providing a streamlined, studio-grade workspace.

> **ComfyUI is NOT bundled with this application and must be downloaded separately.** ComfyGUI acts as a native desktop frontend and process controller. You must have an existing installation of [ComfyUI (v0.33.1 or later)](https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.33.1) on your system or network.

## Features

### Process Launcher & System Telemetry

- **Integrated Subprocess Launcher**: Automatically locate, configure, and launch local ComfyUI standalone/embedded Python (`python.exe` / `python_embeded`) or virtual environments.
- **Auto-Injected Bridge**: Instantly syncs the high-speed `comfyui-comfygui-bridge` custom node into your ComfyUI installation.
- **Live Terminal & ANSI Streaming**: Built-in terminal drawer and full-page server terminal with ANSI color highlighting and log-level filtering.
- **Hardware & VRAM Monitor**: Real-time GPU telemetry displaying active device names and dedicated total/free VRAM.

### Generation Studio (Text2Img, Img2Img, Inpainting)

- **Model Discovery**: Rapid UNet/Diffusion Model, CLIP, and VAE selectors with thumbnail preview caching and quick search.
- **Dynamic LoRA Stack**: Add, remove, toggle, and adjust weights on multiple LoRA models on the fly.
- **Interactive Inpaint Canvas**: Full masking canvas with brush sizing, opacity controls, undo/clear, and **Anima LLLite** inpainting integration (with Turbo LoRA acceleration).
- **Aspect Ratio & Resolution Engine**: Instant resolution presets with custom width/height calculators and batch generation support.
- **Advanced Sampler Controls**: Configurable steps, CFG scale, denoise strength, sampler/scheduler selectors, AuraFlow shift parameters, and seed generators (Random, Fixed, Increment, Decrement).
- **Prompt Engineering & Presets**:
  - Positive and negative prompt editors with token weight keyboard shortcuts (`Ctrl+Up` / `Ctrl+Down`).
  - Prompt token autocomplete.
  - JSON-backed prompt presets and modular LoRA preset stacks.

### WD14 Image Tagger

- **Visual Interrogation**: Drag & drop or upload reference images to extract descriptive Danbooru tags directly inside the studio.
- **Model Support**: Compatible with `wd-eva02-large-tagger-v3`, `wd-vit-large-tagger-v3`, `wd-swinv2-tagger-v3`, `pixai-tagger-v0.9`, and more.
- **Tag Management**: Configurable general/character thresholds, tag exclusion filters, rating tags, and single-click prompt replacement or appending.

### PostFX & Upscaling Pipeline

- **Integrated Upscaler**: Super-resolution models (ESRGAN, RealESRGAN, etc.) with custom scaling multipliers.
- **Visual Post-Processing**:
  - **Styling Stage**: Vignette strength/softness, film grain, chromatic aberration, and bloom threshold/radius.
  - **Adjustment Stage**: Real-time brightness, contrast, saturation, and sharpness tuning.
- **Lossless Metadata Embedding**: Saves full generation parameters directly into generated PNG metadata.

### Live Generation & Execution Pipeline

- **Real-Time Latent Previews**: Decodes ComfyUI binary latent frames (`PREVIEW_IMAGE` / `PREVIEW_IMAGE_WITH_METADATA`) via WebSocket for immediate visual feedback.
- **Interactive Viewport**: Pan, zoom, full-screen preview, side-by-side comparison, and direct actions (Download, Copy to Clipboard, Send to Img2Img, Send to Inpaint).

### Indexed Image Gallery

- **Rust-Powered Background Indexer**: High-performance multi-threaded scanning and thumbnail generation using Rust `image` and `rayon`.
- **Zero-Lag Virtualization**: Smooth scrolling through thousands of images via TanStack Virtual.
- **Metadata Inspector**: Inspect exact generation prompts, sampler settings, seeds, CFG, and model configurations with one-click reuse or workflow copy.

## Supported Models

- [x] **Anima** (AuraFlow-based)
- [ ] **FLUX** (Dev / Schnell)
- [ ] **SDXL / Illustrious / Pony**
- [ ] **Stable Diffusion 1.5**
- [ ] **Krea2**

## 🗺️ Roadmap

- [x] **Core Studio Foundation**
  - [x] Standalone Tauri v2 + Vue 3 desktop client with native frameless window controls
  - [x] Integrated ComfyUI process launcher with Python environment detection & live ANSI terminal
  - [x] Auto-injected `comfyui-comfygui-bridge` node for REST model indexing & VRAM telemetry
  - [x] Anima pipeline (Text2Img, Img2Img, AuraFlow shift scheduling)
  - [x] Interactive Inpaint mask canvas with Anima LLLite and Turbo LoRA acceleration
  - [x] Dynamic LoRA chain with instant weight toggles and WebP preview caching
  - [x] WD14 Tagger visual tag interrogation
  - [x] Real-time PostFX pipeline (Vignette, Film Grain, Chromatic Aberration, Bloom, Color Adjustments)
  - [x] High-speed multi-threaded thumbnail indexer & virtualized Image Gallery
  - [x] JSON prompt & LoRA preset manager
- [ ] **Multi-Architecture Support**
  - [ ] Dynamic graph engine with automatic architecture detection (Anima, FLUX, SDXL, SD 1.5)
  - [ ] Multi-CLIP text encoder support (T5xxl, CLIP-G, CLIP-L)
  - [ ] Standard CheckpointLoaderSimple support alongside UNETLoader
- [ ] **Advanced Generation Tools**
  - [ ] ControlNet / T2I-Adapter integration with preprocessor previews
  - [ ] High-Resolution Fix (Hires Fix) & 2-pass latent upscaling
  - [ ] Segment Anything (SAM) & AI-assisted auto-masking in Inpaint canvas
  - [ ] Multi-image comparison slider (Before / After view)
- [ ] **Workflow & Ecosystem**
  - [ ] Batch prompt runner & generation queue manager
  - [ ] Civitai / Hugging Face model browser & one-click downloader
  - [ ] Remote ComfyUI server profile manager (Local, RunPod, Vast.ai, LAN)

## Requirements

### 1. ComfyUI (External Download Required)

- **Minimum ComfyUI Version**: **[v0.33.1](https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.33.1) or later**.
- **Installation Sources**:
  - **Windows Standalone Portable**: Download the official 7z release archive from [ComfyUI Releases](https://github.com/Comfy-Org/ComfyUI/releases).
  - **Manual / Git Clone**: Clone [Comfy-Org/ComfyUI](https://github.com/Comfy-Org/ComfyUI) with Python 3.10+.

### 2. Custom Nodes Requirements

- [yet_essential](https://github.com/KidiXDev/yet_essential)
- [ComfyUI-WD-Timm-Tagger](https://github.com/bedovyy/ComfyUI-WD-Timm-Tagger)
- [ComfyUI_UltimateSDUpscale](https://github.com/ssitu/ComfyUI_UltimateSDUpscale)
- [ComfyUI-Impact-Pack](https://github.com/ltdrdata/ComfyUI-Impact-Pack) (For FaceDetailer)

## Development & Installation

### Prerequisites

- [Bun](https://bun.sh) (v1.0 or higher)
- [Rust & Cargo](https://www.rust-lang.org/tools/install) (latest stable)
- [Tauri v2 Prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system

### Setup

```bash
# Clone the repository
git clone https://github.com/KidiXDev/comfy-gui.git
cd comfy-gui

# Install frontend dependencies
bun install
```

### Running Locally

```bash
# Run the desktop application in development mode
bun run tauri dev

# Build for Production
bun run tauri build
```

> Check `src-tauri/target/release/` for the compiled binary.

## License

This project is licensed under the [GNU General Public License, version 3](LICENSE).
