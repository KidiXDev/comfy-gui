# ComfyGUI

<p align="center">
  <img src="src/assets/comfygui-logo.png" alt="ComfyGUI Logo" width="120" onerror="this.style.display='none'"/>
</p>

<p align="center">
  <strong>A modern, high-performance standalone desktop application for ComfyUI.</strong>
</p>

<p align="center">
  <a href="https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.33.1"><img src="https://img.shields.io/badge/ComfyUI-%3E%3D%20v0.33.1-blue.svg?style=flat-square" alt="ComfyUI >= v0.33.1"/></a>
  <img src="https://img.shields.io/badge/Tauri-v2-orange.svg?style=flat-square" alt="Tauri v2"/>
  <img src="https://img.shields.io/badge/Vue-v3-emerald.svg?style=flat-square" alt="Vue 3"/>
  <img src="https://img.shields.io/badge/TailwindCSS-v4-38bdf8.svg?style=flat-square" alt="Tailwind CSS v4"/>
  <img src="https://img.shields.io/badge/License-GPLv3-blue.svg?style=flat-square" alt="License"/>
</p>

## Overview

**ComfyGUI** is a dedicated desktop interface designed for creators who want to generate images using the **[Anima](https://huggingface.co/circlestone-labs/Anima)** model family without the complexity of building and maintaining node graphs in ComfyUI.

It provides a clean, studio-grade workspace with all the tools you need. Prompting with tag autocomplete, live generation previews, inpainting, FaceDetailer, background removal, and more while executing dynamic ComfyUI workflows automatically in background.

## Requirements

### 1. ComfyUI

- **Minimum ComfyUI Version**: **[v0.33.1](https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.33.1) or later**.

### 2. Supported Model

Currently, **ComfyGUI only supports the [Anima](https://huggingface.co/circlestone-labs/Anima)** model family. Other architectures may work but not really work as expected.

### 3. Required External Custom Nodes

ComfyGUI generates dynamic graph payloads that utilize nodes from the following external custom nodes. You must install them into your ComfyUI `custom_nodes/` directory:

- [yet_essential](https://github.com/KidiXDev/yet_essential)
- [ComfyUI-WD-Timm-Tagger](https://github.com/bedovyy/ComfyUI-WD-Timm-Tagger)
- [ComfyUI_UltimateSDUpscale](https://github.com/ssitu/ComfyUI_UltimateSDUpscale)
- [ComfyUI-Impact-Pack](https://github.com/ltdrdata/ComfyUI-Impact-Pack)
- [ComfyUI-Impact-Subpack](https://github.com/ltdrdata/ComfyUI-Impact-Subpack)
- [ComfyUI-Aaalice-Nodes](https://github.com/Aaalice233/ComfyUI-Aaalice-Nodes)
- [ComfyUI-RMBG](https://github.com/1038lab/ComfyUI-RMBG)

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
