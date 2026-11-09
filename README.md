# SPEJL — lokal ansigtsanalyse (front + side → 1–10)

Modern web app that captures **two photos** — one front-facing and one side profile — runs **MediaPipe Face Landmarker** in the browser, and shows a constructive combined **1–10** score with Danish explanations.

## Run locally

```bash
npm install
npm run dev
```

Open the printed URL (default [http://localhost:5173](http://localhost:5173)).

## Flow

1. **Front** — look straight into the camera (or upload)  
2. **Side** — turn ~90° for a profile shot (or upload)  
3. **Score** — both images are analyzed together for one overall rating

Camera is preferred; upload works as fallback. “Prøv eksempel” loads bundled front + side samples.

## How scoring works

Face landmarks are detected locally on both images (no paid APIs).

**From the front photo** (Face Landmarker)

- Symmetri — left/right balance  
- Proportioner — facial thirds + height/width  
- Øjenbalance — spacing and openness  
- Front-presence — how frontal/clear the shot is  

**From the side photo** (Landmarker, with BlazeFace detector fallback for pure profiles)

- Profilsilhuet — nose/forehead/chin harmony  
- Kæbelinje — jaw/chin line in profile  
- Side-presence — how clearly profile-like the pose is  

The overall score is a weighted blend of those factors. Transparent heuristics for an offline demo — not a scientific attractiveness measure.

## Stack

- Vite + React + TypeScript  
- `@mediapipe/tasks-vision` Face Landmarker + Face Detector (models in `public/models/`)  
