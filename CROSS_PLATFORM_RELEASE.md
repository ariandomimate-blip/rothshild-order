# Cross-platform app release standard

This repository is in the user's standing cross-platform app rollout.

## Required deliverables for this project

Prepare a project-specific, installable app experience for:
- Android (APK/AAB; Capacitor Android where the project is a web app)
- iOS and iPadOS (IPA/App Store; Capacitor iOS where suitable)
- macOS (signed/notarized app; Tauri where suitable)
- Windows (installer/MSIX or executable; Tauri where suitable)
- Linux (AppImage/deb/rpm where suitable)
- Installable web app (PWA) where the product has a browser UI

Repository: `ariandomimate-blip/rothshild-order`

## Implementation and release rules

1. Inspect this repository's actual framework, entry point, API contracts, build scripts, and existing deployment before choosing an adapter. Do not overwrite or replace the existing application.
2. Keep the product's own branding, UI, account model, permissions, AI personality, data, payment flows, and integrations intact. Keep this project isolated from other products unless an existing explicit integration requires otherwise.
3. Use a shared cross-platform build pattern only where technically suitable: Capacitor for web-based Android/iOS; Tauri for desktop; PWA for browser installation. Native modules may be needed for OS-specific functionality.
4. Implement OS-aware navigation, safe areas, responsive layouts, deep links, offline/error states where appropriate, secure credential storage, accessibility, and update handling.
5. Add project-specific build scripts, CI workflows, icons, splash screens, privacy disclosures, support links, and store metadata only after inspecting the real app and required secrets.
6. Build and test each target. Do not claim APK/AAB, IPA, DMG, EXE/MSIX, AppImage, or store publication exists until the artifact is produced and verified.
7. Deploy web/backend changes only after root-cause checks, tests, and deployment verification. Never expose secrets in source control.

## Current release state

This file records the required rollout scope. It does not claim that native platform projects, signed installers, CI builds, or store approvals already exist. Record actual artifacts, build IDs, test results, and deployment URLs here as they are verified.

## ULTIMA operations

Keep this project discoverable in ULTIMA's project/update inventory. Preserve the user's project-specific exclusions and existing independent shop/account boundaries.
