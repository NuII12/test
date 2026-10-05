# Foldr: file tools that run in your browser

A static site (no backend, no build step). Files are processed locally and never uploaded.

## Deploy to GitHub Pages
1. Create a GitHub repository and push this folder to the `main` branch.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` publishes the site on every push.

All paths are relative, so it works under `https://<user>.github.io/<repo>/`.
To test locally: `python3 -m http.server` in this folder (ES modules need http, not file://).

## Tools included
- **Video** (exported as WebM in real time with MediaRecorder): Crop Video, Trim Video
- **Image** (Canvas): Resize, Crop, Color Picker, Rotate, Flip, Enlarger
- **PDF** (pdf-lib, PDF.js): Merge, Split, Page Remover, Extract Pages, Rotate, Organize, Resize, Crop, Flatten, Reader

## Not included yet
GIF Maker, Edit PDF, Annotate PDF, E-sign, Create Fillable PDF, Extract Images from PDF, Protect PDF, Unlock PDF.
Protect and Unlock need real PDF encryption, which pdf-lib does not provide; they need a different library (for example qpdf compiled to WebAssembly).

## Notes
- Libraries (pdf-lib, PDF.js, JSZip) load from jsDelivr only when a tool needs them.
- Crop and page selection use percentages and page-range text, not a drag-to-draw box or thumbnails.
- Video export plays the clip while recording, so it takes as long as the selected section.

## Structure
`index.html` (shell), `styles.css` (themes), `app.js` (settings, sound, search, tool pages, processing engines).
