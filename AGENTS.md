# AGENTS.md

This document provides context and guidelines for AI Agents working on the **comfy-gui** codebase.

---

## 1. Project Overview

- **Application Type**: Desktop Application (Tauri v2 + Vue 3)
- **Package Manager / Runtime**: [Bun](https://bun.sh)
- **Frontend**: Vue 3 (Composition API with `<script setup lang="ts">`), TypeScript & Tailwind CSS v4
- **Backend / Desktop Container**: Tauri v2 (Rust backend located in `src-tauri/`)
- **Purpose**: Standalone ComfyUI GUI and process launcher with model discovery, prompt autocomplete, live generation previews, workflow/preset state, ANSI log streaming, and an indexed output image gallery.

---

## 2. Tech Stack & Libraries

| Category             | Technology / Library                                                         | Description                                                                            |
| :------------------- | :--------------------------------------------------------------------------- | :------------------------------------------------------------------------------------- |
| **Framework**        | Vue 3 (`vue`)                                                                | Reactive UI with TypeScript (`<script setup lang="ts">`)                               |
| **Desktop Shell**    | Tauri v2 (`@tauri-apps/api`, `@tauri-apps/cli`)                              | Lightweight native desktop container with IPC invoke and events                        |
| **Native Dialogs**   | `rfd` (Rust File Dialog)                                                     | Native OS file & folder picker dialogs for selecting ComfyUI/Python directories        |
| **Build Tool**       | Vite (`vite`, `@vitejs/plugin-vue`)                                          | Lightning-fast bundler and dev server                                                  |
| **Styling**          | Tailwind CSS v4 (`tailwindcss`, `@tailwindcss/vite`)                         | Modern CSS utility engine using `@import "tailwindcss";`                               |
| **UI Components**    | shadcn-vue (`reka-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`) | Modern, accessible headless components located in `src/components/ui/`                 |
| **Icons**            | Lucide Icons (`@lucide/vue`, `@lucide/vue`)                              | Minimalist, high-quality icon set                                                      |
| **State Management** | Pinia (`pinia`)                                                              | Modular reactive store management (`src/stores/`)                                      |
| **Routing**          | Vue Router (`vue-router`)                                                    | Client-side routing for workflow, gallery, server, settings, and about views           |
| **Virtualization**   | TanStack Virtual (`@tanstack/vue-virtual`)                                   | Virtualized image gallery rows                                                         |
| **Utilities**        | `@vueuse/core`                                                               | Vue Composition API utility collection                                                 |
| **Linter**           | Oxlint (`oxlint`)                                                            | Ultra-fast Rust-based JavaScript/TypeScript linter                                     |
| **Formatter**        | Prettier (`prettier`)                                                        | Code formatter with `prettier-plugin-organize-imports` & `prettier-plugin-tailwindcss` |

---

## 3. Project Structure

```
comfy-gui/
├── comfyui-comfygui-bridge/ # Source copy of the custom node bridge installed into ComfyUI
│   └── __init__.py         # Exposes /comfygui/models, /comfygui/system, /comfygui/refresh
├── src/
│   ├── assets/             # Static frontend assets & images
│   ├── components/         # Reusable Vue components
│   │   ├── common/         # Atomic & specialized UI components (ServerStatusBadge.vue, SeedControl.vue, etc.)
│   │   ├── template/       # Structural templates (NavbarTemplate.vue, TerminalDrawer.vue, LauncherSettingsModal.vue)
│   │   └── ui/             # shadcn-vue primitive components (button, dialog, input, sheet, badge, etc.)
│   ├── router/             # Vue Router route configuration (index.ts)
│   ├── services/           # Backend integration & API clients
│   │   ├── comfyApi.ts     # ComfyUI HTTP REST client & bridge endpoints
│   │   ├── comfyWs.ts      # WebSocket client for execution progress & binary latent previews
│   │   ├── imageGallery.ts # Tauri image gallery/index IPC client
│   │   ├── presetService.ts # File-backed prompt and LoRA preset IPC client
│   │   ├── promptAutocomplete.ts # Prompt token replacement and spacing helpers
│   │   └── workflowBuilder.ts # Dynamic ComfyUI prompt graph generator
│   ├── stores/             # Pinia state stores
│   │   ├── comfyStore.ts   # ComfyUI connection state, model discovery & live generation
│   │   ├── historyStore.ts # Generated image session history
│   │   ├── launcherStore.ts# Process launcher configuration, log streaming & IPC triggers
│   │   └── workflowStore.ts# Generation parameters, sampler settings & prompt state
│   ├── types/              # TypeScript interfaces and type definitions
│   │   ├── comfy.ts        # ComfyUI REST/WS schemas & Bridge API types
│   │   ├── launcher.ts     # Process status, configs & log payloads
│   │   └── workflow.ts     # Workflow state and node parameters
│   ├── utils/              # Utility helpers
│   │   └── logFormatter.ts # ANSI color code parser & smart log-level classifier
│   ├── views/              # Workflow, image gallery, server terminal, settings, about, and home views
│   ├── App.vue             # Root application component with <RouterView />
│   ├── main.css            # Global CSS with `@import "tailwindcss";` and design tokens
│   ├── main.ts             # App entry point (registers Pinia, Router)
│   └── vite-env.d.ts       # Vite & Vue client type definitions
├── src-tauri/              # Rust backend source code & Tauri configuration
│   ├── src/
│   │   ├── image_gallery.rs # Indexed output discovery, thumbnail cache, metadata extraction
│   │   ├── lib.rs          # Tauri setup and command registration
│   │   ├── main.rs         # Desktop binary entry point
│   │   ├── preset_manager.rs # JSON prompt/LoRA preset file management
│   │   └── process_manager.rs # Subprocess lifecycle, path resolution & async stream readers
│   ├── Cargo.toml          # Rust dependencies (tauri, rfd, serde, serde_json)
│   └── tauri.conf.json     # Tauri window & bundle configuration
├── components.json         # shadcn-vue component configuration
├── index.html              # HTML entry point
├── package.json            # Scripts & frontend dependencies
├── tsconfig.json           # TypeScript compiler configuration
└── vite.config.ts          # Vite configuration with Tailwind CSS & Vue plugins
```

---

## 4. Key Architecture & Features

1. **Rust Process Manager (`src-tauri/src/process_manager.rs`)**:
   - Spawns and manages the local ComfyUI Python process (`python.exe` / `python_embeded`).
   - Automatically resolves relative paths against the selected ComfyUI directory.
   - Sets `PYTHONUNBUFFERED=1` and `PYTHONIOENCODING=utf-8` to ensure real-time terminal streaming.
   - Dispatches live log events (`comfyui-log`) and process state changes (`comfyui-status`) to the frontend.

2. **Native File & Folder Picker**:
   - Uses `rfd` (Rust File Dialog) in Tauri commands `pick_directory` and `pick_file` to allow native OS folder/file selection for ComfyUI and embedded Python paths.

3. **ComfyGUI Bridge Custom Node (`comfyui-comfygui-bridge/`)**:
   - Source resides in `comfyui-comfygui-bridge/__init__.py` and is compiled directly into the Tauri binary via `include_str!`.
   - Automatically verified, injected, or updated into ComfyUI's `custom_nodes/comfyui-comfygui-bridge/` before launching Python.
   - Exposes high-performance REST endpoints:
     - `GET /comfygui/models`: Returns complete lists of checkpoints, unets, loras, vaes, clips, upscale models, controlnets, samplers, and schedulers.
     - `GET /comfygui/system`: Returns hardware specs, device names, and real-time total/free VRAM.
     - `POST /comfygui/refresh`: Re-indexes model directories on demand.

4. **Custom Frameless Titlebar & Window Capabilities**:
   - Window decorations are disabled in `tauri.conf.json` (`"decorations": false, "shadow": true`).
   - Managed by `src/components/template/AppTitlebar.vue` with `data-tauri-drag-region`, route breadcrumbs, server status badge, and window controls (minimize, maximize/restore, close).
   - Backed by Tauri core window permissions in `src-tauri/capabilities/default.json`.

5. **Responsive Workspace & Resizable Splitters**:
   - Studio layout in `WorkflowGeneratorView.vue` is powered by shadcn-vue `ResizablePanelGroup`, `ResizablePanel`, and `ResizableHandle`.
   - Allows dynamic horizontal resizing between Generation Parameters (left) and the Render Viewport (right).
   - Viewport image dynamically fits without overflow (`max-h-full max-w-full object-contain pb-11`).

6. **WebSocket & Live Execution Pipeline (`src/services/comfyWs.ts`)**:
   - Listens to execution graph events (`executing`, `progress`, `executed`, `execution_error`).
   - Decodes ComfyUI binary latent preview frames (`PREVIEW_IMAGE` and `PREVIEW_IMAGE_WITH_METADATA`) using `ArrayBuffer` and `DataView`.
   - Handles automatic reconnection with exponential backoff and connection state tracking.

7. **Terminal & ANSI Log Parser (`src/utils/logFormatter.ts`)**:
   - Parses ANSI color codes (`\u001b[32m`, `[32m`, etc.) into styled color spans.
   - Distinguishes standard Python `stderr` logging output (e.g. `[INFO]` startup messages) from actual errors (`[ERROR]`, `Traceback`, `Exception`).

8. **Indexed Image Gallery (`src-tauri/src/image_gallery.rs`, `src/views/ImageViewerView.vue`)**:
   - Persists an output image index and generated thumbnails in the application cache directory.
   - Restores the cached index immediately when navigating to the gallery, then performs a lightweight background file scan so newly generated images appear without a full-screen indexing flash.
   - Full thumbnail re-indexing is reserved for explicit refresh/cache-clear actions.

9. **Prompt & LoRA Presets**:
   - Prompt and LoRA presets are stored as JSON files through `preset_manager.rs` and `presetService.ts`.
   - LoRA presets only replace or append the LoRA stack; they must not change prompts, models, sampler, resolution, or PostFX state.

---

## 5. Key Conventions & Best Practices

1. **Prettier Plugin Order**:
   - In [.prettierrc](.prettierrc), `prettier-plugin-tailwindcss` **must always remain the last item** in the `plugins` array to ensure class sorting works properly.

2. **Component Code Style**:
   - Use Single File Components (`.vue`) with `<script setup lang="ts">`.
   - Prefer Composition API with `ref`, `computed`, `watch`, and Pinia store composables.
   - Place shared headless UI primitives in `src/components/ui/` and application templates in `src/components/template/`.

3. **Path Sanitization**:
   - Strip leading/trailing quotes when accepting path inputs in the frontend and backend.

4. **Routine Frontend Validation**:
   - Do not run `bun run build` for routine validation; it also performs an unnecessary Vite production bundle.
   - Run `bun run lint` and `bun x vue-tsc --noEmit` instead.
   - Run `bun run build` only when explicitly requested or when validating production bundling behavior.

5. **Select Component Conventions & Tailwind Best Practices**:
   - Always use the shadcn-vue `Select` suite (`Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectGroup`, `SelectItem`) instead of native `<select>` tags.
   - When rendering options inside `<SelectContent>`, always wrap the items inside `<SelectGroup class="max-h-40 overflow-y-auto">` to ensure smooth scrolling and avoid viewport overflow on long model/preset lists.
   - Always prefer standard canonical Tailwind utility classes (e.g. `max-h-40`, `text-xs`, `text-sm`, `text-base`) instead of arbitrary values like `max-h-[10rem]` or `text-[10px]`.

---

## 6. Useful Commands

Always use `bun` as the package runner/manager:

```bash
# Start development server
bun run dev

# Run Tauri desktop app in development
bun run tauri dev

# Check TypeScript types (preferred routine validation)
bun x vue-tsc --noEmit

# Package standalone production binaries and installers
bun run tauri build

# Run linter
bun run lint

# Build the frontend production bundle only when explicitly needed
bun run build

# Format code with Prettier
bun run format

# Check formatting
bun run format:check

# Cargo check for Rust backend
cargo check --manifest-path src-tauri/Cargo.toml
```
