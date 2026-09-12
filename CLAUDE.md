# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

ComfyGUI: a Tauri v2 (Rust) + Vue 3 desktop frontend for ComfyUI, targeting the Anima model family. Read [AGENTS.md](AGENTS.md) for conventions (shadcn `Select` usage, Tailwind canonical classes, Prettier plugin order, path sanitization). Its "Project Structure" section is stale — the tree below reflects the current layout.

## Commands

Always use `bun` (never npm/yarn). Rust toolchain required for anything touching `src-tauri/`.

```bash
bun install
bun run tauri dev                       # full desktop app (starts vite on :1420 automatically)
bun run dev                             # vite only — Tauri `invoke` calls will fail in a plain browser
bun run lint                            # oxlint (src/components/ui/** is ignored)
bun run typecheck                       # vue-tsc --noEmit — preferred routine validation
bun run format                          # prettier --write .
bun test                                # all *.test.{ts,js} under src/ (bun:test + node:assert)
bun test src/services/workflowBuilder.test.ts   # single file
bun tests/confirm-dialog.check.ts       # tests/*.check.* are standalone scripts, not picked up by `bun test`
cargo check --manifest-path src-tauri/Cargo.toml
bun run tauri build                     # production bundle (slow; only when asked)
```

Do not run `bun run build` for routine validation — it does a full Vite production bundle. Use `lint` + `typecheck`.

Releases: pushing a `v*` tag runs `.github/workflows/release.yml` (Windows-only NSIS + portable zip). `VITE_APP_VERSION` is injected from the tag; `src/version.ts` reads it.

## Architecture

Three processes talk to each other:

```
Vue frontend (src/)  ──Tauri invoke/events──▶  Rust backend (src-tauri/src/)
       │                                              │ spawns python main.py
       └──HTTP :8188 + WebSocket──────────────▶  ComfyUI  ◀── bridge custom node injected by Rust
```

### Frontend → Rust (Tauri IPC)

- Every Rust command is registered in the `generate_handler![...]` list in `src-tauri/src/lib.rs`; a new `#[tauri::command]` does nothing until added there.
- Frontend never calls `invoke` from components directly — each Rust module has a thin TS client in `src/services/` (`imageGallery.ts`, `presetService.ts`, `libraryService.ts`, `downloadManager.ts`, `animadexApi.ts`, `booruGallery.ts`, `civitai.ts`, `danbooruWiki.ts`, `promptSuggestionService.ts`). Persistent key/value app data goes through `src/services/appStorage.ts` → `*_app_data*` commands.
- Rust pushes to the frontend via events: `comfyui-log` (ANSI log lines) and `comfyui-status` from `process_manager.rs`; download progress from `download_manager.rs`.
- Rust modules: `process_manager.rs` (spawn/stop ComfyUI, model discovery via embedded `local_model_discovery.py`), `image_gallery.rs` (output index + thumbnail cache), `library_manager.rs`, `preset_manager.rs`, `prompt_suggestions.rs`, `download_manager.rs`, `civitai.rs`, `animadex.rs`, `danbooru_wiki.rs`, `network_cache.rs`, and `booru/` (a `Provider` trait in `mod.rs` with one file per site: danbooru, gelbooru, moebooru, safebooru, aitag — add a booru by implementing the trait and appending to `providers()`).

### Frontend → ComfyUI (direct network)

- `src/services/comfyApi.ts` — REST client (`/prompt`, `/history`, `/object_info`, plus the bridge's `/comfygui/*` endpoints) over `httpClient.ts` (axios, shared error formatting).
- `src/services/comfyWs.ts` — WebSocket for `executing`/`progress`/`executed`/`execution_error` and binary `PREVIEW_IMAGE` frames; reconnects with backoff.
- `src/services/workflowBuilder.ts` — turns `WorkflowState` (`src/types/workflow.ts`) into a ComfyUI API-format prompt graph. Txt2img, img2img, inpaint, and the FaceDetailer stage (`faceDetailerWorkflow.ts`) all build here; `prepareWorkflowForQueue` resolves seeds before submission. This is the file to change when adding a node/feature to generation, and it is the most heavily tested one.
- Model/queue/system reads go through TanStack Query composables in `src/composables/use*Queries.ts` with keys in `queryKeys.ts`; Pinia stores (`src/stores/`) hold mutable UI/session state (`comfyStore` = connection + live generation, `workflowStore` = parameters, `launcherStore` = process config/logs, `aiStore` = assistant chat).

### The bridge custom node (`comfyui-comfygui-bridge/`)

`__init__.py` and `web/workspace.js` are compiled into the Rust binary with `include_str!` in `process_manager.rs` and written into ComfyUI's `custom_nodes/comfyui-comfygui-bridge/` before every launch (`inject_bridge_custom_node`). Editing the Python/JS here changes what gets injected — no separate install step. It adds `/comfygui/models`, `/comfygui/system`, `/comfygui/health`, `/comfygui/refresh`, `/comfygui/shutdown`, `/comfygui/model_preview`. `workspace.js` runs inside the embedded ComfyUI iframe and bridges `postMessage` to `src/composables/useComfyUiWorkspace.ts` (allowed parent origins are hard-coded there).

### Frontend layout

- `src/views/` — one file per route (`src/router/index.ts`): workflow, viewer (gallery), booru, animadex, civitai, upscaler, remove-background, face-detailer, server, library, settings, danbooru-wiki, embedded comfyui.
- `src/components/ui/` is shadcn-vue generated code — excluded from lint, don't hand-edit unless intentional. Feature components live in sibling folders (`common/`, `layout/`, `booru/`, `civitai/`, `ai/`, …).
- AI assistant (`aiStore.ts`, `aiService.ts`, `src/lib/aiPrompts.ts`) uses Vercel `ai` SDK with the OpenRouter provider.
- Window is frameless (`decorations: false`); the titlebar is a Vue component with `data-tauri-drag-region`.

## Testing conventions

Tests sit next to the code as `*.test.ts`/`*.test.js` and use `bun:test` (`mock.module` for Tauri/service mocks) with `node:assert/strict`. Pinia-backed tests call `setActivePinia(createPinia())`. `tests/*.check.*` are ad-hoc runnable scripts kept outside the `bun test` glob.
