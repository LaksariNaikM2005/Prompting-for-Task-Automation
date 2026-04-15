# Prompting for Task Automation

Prompting for Task Automation is a FastAPI + frontend web app that converts unstructured text into structured insights using Google Gemini when an API key is available, and a simulation mode when it is not.

## Features

- Analyze raw text and return:
  - A 3-point summary
  - Structured data fields: names, dates, locations, and keywords
- Automatic simulation fallback when GOOGLE_API_KEY is missing
- Dataset import support for training, validation, and test workflows
- Dataset template download from the frontend
- JSON export and copy actions in the UI

## Project Structure

- backend/
  - main.py: FastAPI app and API routes
- frontend/
  - index.html: UI structure
  - script.js: UI behavior and API calls
  - style.css: UI styling
- scratch/
  - check_paths.py: helper script for checking path resolution
- Dockerfile
- requirements.txt
- .env.example

## Prerequisites

- Python 3.10+ (3.13 recommended)
- pip
- Optional: Google Gemini API key

## Environment Setup

1. Create and activate a virtual environment.

Windows PowerShell:

python -m venv venv
.\venv\Scripts\Activate.ps1

2. Install dependencies.

pip install -r requirements.txt

3. Configure environment variables.

- Copy .env.example to .env
- Set your key:
  - GOOGLE_API_KEY=your_gemini_api_key_here

If GOOGLE_API_KEY is not set, the app still runs in simulation mode.

## Run Locally

Start the server from the project root:

python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

Optional frontend dev server (hot/static local serving):

cd frontend
npm install
npm run dev

When using npm dev server, open:

http://127.0.0.1:5173

When using backend static hosting only, open:

http://127.0.0.1:8000

Open directly in Google Chrome (run in another PowerShell terminal):

Start-Process chrome "http://127.0.0.1:8000"

Open in your browser:

http://127.0.0.1:8000

## Run with Docker

Build image:

docker build -t prompting-task-automation .

Run container:

docker run --rm -p 8000:8000 --env-file .env prompting-task-automation

Open:

http://127.0.0.1:8000

## API Endpoints

0. GET /health
- Purpose: Quick backend availability check
- Response:
  - status
  - backend
  - ai_mode

1. POST /process
- Purpose: Process free text into summary + structured data
- Request body:
  - text: string
- Response:
  - status
  - raw_text
  - summary
  - structured_data

2. POST /dataset/import
- Purpose: Import a dataset file
- Supported formats: .json and .csv
- Behavior:
  - If split labels are provided, keeps train/validation/test as provided
  - Otherwise auto-splits into train (70%), validation (15%), and test (15%)
- Response:
  - status
  - filename
  - dataset
  - summary

3. GET /dataset/summary
- Purpose: Return current in-memory dataset counts and samples

## Dataset Formats

JSON options:

1. Explicit split object:

{
  "train": [{"input_text": "..."}],
  "validation": [{"input_text": "..."}],
  "test": [{"input_text": "..."}]
}

2. Flat record list (auto-split):

[
  {"input_text": "..."},
  {"input_text": "..."}
]

3. Wrapped record list (auto-split):

{
  "records": [{"input_text": "..."}]
}

CSV options:

- With split column (values: train/training, validation/val/dev, test/testing)
- Without split column (auto-split)

## Frontend Workflow

1. Enter raw text and click Process with Gemini AI.
2. Review summary, structured JSON, and raw text.
3. Use Download to export extracted JSON.
4. Use Copy to copy raw text.
5. Use Download Template to get a starter dataset.
6. Upload JSON or CSV with Import Dataset to populate train/validation/test summary cards.

## Notes

- Dataset storage is in-memory and resets when the server restarts.
- The app serves frontend static files from the FastAPI backend.
- If Gemini calls fail, the app automatically uses local simulation logic.

## Task 03 Submission

### 1) Final Prompt (Used for Task Automation)

Use this prompt to process unstructured text into a concise summary and structured JSON.

```
Analyze the following text and provide:
1. A concise summary as a list of 3 key points.
2. Structured data extracting:
   - Names (people or organizations)
   - Dates (any mentioned dates)
   - Locations (physical places)
   - Keywords (top 5 essential terms)

Return the result strictly as a JSON object with this structure:
{
  "summary": ["point 1", "point 2", "point 3"],
  "structured_data": {
    "names": ["name1", "name2"],
    "dates": ["date1"],
    "locations": ["loc1"],
    "keywords": ["kw1", "kw2", "kw3", "kw4", "kw5"]
  }
}

Text to analyze:
{input_text}
```

### 2) Input-Output Examples

#### Example 1

Input:
```
On March 4, 2026, Sarah Lee from BrightEdge Logistics met with the operations team in Chicago to review delayed shipments. The group agreed to launch a route optimization pilot next week.
```

Output:
```json
{
  "summary": [
    "Sarah Lee met with operations to review shipment delays.",
    "The meeting took place in Chicago on March 4, 2026.",
    "The team approved a route optimization pilot for next week."
  ],
  "structured_data": {
    "names": ["Sarah Lee", "BrightEdge Logistics"],
    "dates": ["March 4, 2026"],
    "locations": ["Chicago"],
    "keywords": ["shipments", "delays", "operations", "route", "optimization"]
  }
}
```

#### Example 2

Input:
```
The City Health Council announced a vaccination drive on 2026-05-10 at Central Community Hall in Denver. Dr. Miguel Torres said the campaign will prioritize high-risk neighborhoods.
```

Output:
```json
{
  "summary": [
    "A vaccination drive was announced by the City Health Council.",
    "The event is scheduled for 2026-05-10 at Central Community Hall in Denver.",
    "The campaign will prioritize high-risk neighborhoods according to Dr. Miguel Torres."
  ],
  "structured_data": {
    "names": ["City Health Council", "Dr. Miguel Torres"],
    "dates": ["2026-05-10"],
    "locations": ["Central Community Hall", "Denver"],
    "keywords": ["vaccination", "campaign", "health", "prioritize", "neighborhoods"]
  }
}
```

#### Example 3

Input:
```
During the April planning call, Orion Tech and Nova Retail agreed to move the product launch to 04/30/2026. The marketing workshop will be held in Austin, and follow-up notes are due by Friday.
```

Output:
```json
{
  "summary": [
    "Orion Tech and Nova Retail updated the product launch timeline.",
    "The launch was moved to 04/30/2026 and a marketing workshop is planned in Austin.",
    "The team set a Friday deadline for follow-up notes."
  ],
  "structured_data": {
    "names": ["Orion Tech", "Nova Retail"],
    "dates": ["04/30/2026", "Friday"],
    "locations": ["Austin"],
    "keywords": ["planning", "launch", "marketing", "workshop", "timeline"]
  }
}
```

### 3) Reflection on Prompt Iteration and Debugging

The first version of the prompt produced inconsistent formats, especially when the model returned plain text instead of strict JSON. To improve reliability, the prompt was revised with a fixed schema and explicit field names. During testing, edge cases such as short text, missing entities, and mixed date formats were checked. Adding strict JSON instructions and schema examples significantly reduced parsing errors and made outputs more consistent across different inputs.

## Troubleshooting

1. Command not found for backend.main:app
- Run through uvicorn, not directly:
  - python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

2. WinError 10013 on port 8000
- Another process is already using port 8000.
- Check process:
  - Get-NetTCPConnection -LocalPort 8000 | Select-Object LocalAddress,LocalPort,State,OwningProcess
- Stop conflicting PID:
  - Stop-Process -Id <PID> -Force

3. Frontend shows fetch/JSON error in npm dev mode
- Ensure backend is running at http://127.0.0.1:8000.
- Check health endpoint:
  - Invoke-RestMethod -Uri "http://127.0.0.1:8000/health"

## License

No license file is currently included in this repository.
