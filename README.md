# LTS - Operational Automation Hub

> **Internal tooling suite developed for Transwolff's Operational Control Center.**

## 🎯 Overview
LTS is a set of web tools that replaces manual Word/Excel formatting in the daily operational reporting routine. The operator fills in a structured form and gets a standardized `.docx` report (and optionally a PDF) generated from a pre-defined company template.

The team uses it daily for accident reports, road interference reports and formatted alerts.

## 🚀 Modules

### 1. Acidentes
Accident report generator.
- **Structured form:** occurrence data, location, description and outcome, plus the agencies and internal contacts involved.
- **Multiple people per report:** any number of drivers, victims, third parties and witnesses, each rendered as its own numbered table in the document.
- **Images:** screenshots and photos can be pasted or dropped in, are resized to fit the page and are placed in the annex section.
- **Address lookup:** paste GPS coordinates and the street, number and neighborhood are filled in after a map confirmation step.
- **Text review (beta):** grammar and spelling review of the narrative fields with Gemini. Suggestions are shown side by side with the original and nothing is applied until the operator approves it.
- **Spreadsheet line and e-mail:** builds the row for the occurrence control sheet and opens a pre-filled e-mail draft for the right distribution list.
- **Output:** a Word document, or Word plus PDF.

### 2. Interferências
Same flow as Acidentes, for interferences on the road network (works, flooding, events, system instability). It includes quick-fill presets for the most common cases.

### 3. Alertas
Rich-text editor to write and format an alert and copy it as HTML.

## 🛠️ Tech Stack
- **Frontend:** vanilla JavaScript, HTML5 and CSS3. No build step.
- **Document generation:** `docxtemplater` with `PizZip` and an image module, filling `.docx` templates directly in the browser.
- **Serverless functions (Vercel, Node.js):**
  - `api/check-text.js`: text review with Google Gemini (`@google/genai`).
  - `api/convert-pdf.js`: DOCX to PDF with Adobe PDF Services.
  - `api/geocode.js`: reverse geocoding with the Google Maps Geocoding API.
- **Alertas editor:** Quill.

## 📁 Structure
```
index.html           Hub with links to the three tools
api/                 Serverless functions
apps/acidentes/      Accident report (form, logic, template.docx)
apps/ocorrencias/    Interference report (form, logic, template.docx)
apps/alertas/        Alert editor
```

## ⚙️ Configuration
The serverless functions read these environment variables:

| Variable | Used by |
| --- | --- |
| `GEMINI_API_KEY` | `api/check-text.js` |
| `GOOGLE_MAPS_KEY` | `api/geocode.js` |
| `ADOBE_CLIENT_ID`, `ADOBE_CLIENT_SECRET` | `api/convert-pdf.js` |

To run it locally with the `/api` routes available, use the Vercel CLI (`vercel dev`).

## 💡 Impact
- **Efficiency:** Reduced report creation time by approximately 70% (from ~20min to ~5min per report).
- **Standardization:** Eliminated formatting errors and inconsistencies in official documentation.
- **Usability:** Simplified a complex workflow into an intuitive UI accessible to non-technical staff.

---
*Developed by David Bitner.*
