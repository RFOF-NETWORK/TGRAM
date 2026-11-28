# Workflow Doctor Report

- Workflow: `Scorecard`
- Run: `None`
- Time: 2026-11-28T04:54:32.325921+00:00

## [SOLVED] scorecard-gcr-billing
- Diagnose: Old scorecard-action version pulls its image from gcr.io, which is no longer available.
- Loesung: Use ossf/scorecard-action@v2.6.0 (image on ghcr.io).
- Auto-Fix: report only (manual/known solution)
```
gcr.io/openssf/scorecard-action:v2.4.0'
```
