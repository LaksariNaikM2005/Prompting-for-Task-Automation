import re
import os
import json
import csv
import io
from typing import Any, Dict, List
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# Configure Gemini API
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)
    model = genai.GenerativeModel('gemini-1.5-flash')
else:
    print("WARNING: GOOGLE_API_KEY not found. Falling back to simulation mode.")
    model = None

app = FastAPI(title="Prompting for Task Automation API")

dataset_store: Dict[str, List[Dict[str, Any]]] = {
    "train": [],
    "validation": [],
    "test": []
}

# Enable CORS for frontend interaction
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files path (absolute)
frontend_path = os.path.abspath(os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend"))

class InputText(BaseModel):
    text: str


def normalize_split_name(split_name: str) -> str:
    normalized = split_name.strip().lower()
    if normalized in {"train", "training"}:
        return "train"
    if normalized in {"validation", "val", "dev"}:
        return "validation"
    if normalized in {"test", "testing"}:
        return "test"
    raise ValueError(f"Unsupported split name: {split_name}")


def split_records(records: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    if not records:
        return {"train": [], "validation": [], "test": []}

    total = len(records)
    train_end = max(1, int(total * 0.7)) if total > 1 else 1
    validation_end = min(total, train_end + max(1, int(total * 0.15))) if total > 2 else train_end

    return {
        "train": records[:train_end],
        "validation": records[train_end:validation_end],
        "test": records[validation_end:]
    }


def load_dataset_from_json(payload: Any) -> Dict[str, List[Dict[str, Any]]]:
    if isinstance(payload, list):
        records = [record for record in payload if isinstance(record, dict)]
        return split_records(records)

    if not isinstance(payload, dict):
        raise ValueError("JSON dataset must be an object or array.")

    split_keys = {"train", "validation", "test"}
    if split_keys.intersection(payload.keys()):
        split_data: Dict[str, List[Dict[str, Any]]] = {"train": [], "validation": [], "test": []}
        for split_name in split_keys:
            records = payload.get(split_name, [])
            if not isinstance(records, list):
                raise ValueError(f"{split_name} must be a list.")
            split_data[split_name] = [record for record in records if isinstance(record, dict)]
        return split_data

    for candidate_key in ("records", "items", "examples", "data"):
        if candidate_key in payload and isinstance(payload[candidate_key], list):
            records = [record for record in payload[candidate_key] if isinstance(record, dict)]
            return split_records(records)

    raise ValueError("JSON dataset must contain train/validation/test arrays or a records list.")


def load_dataset_from_csv(csv_text: str) -> Dict[str, List[Dict[str, Any]]]:
    reader = csv.DictReader(io.StringIO(csv_text))
    records = [row for row in reader if any(value.strip() for value in row.values() if value)]

    if not records:
        return {"train": [], "validation": [], "test": []}

    if any("split" in record for record in records):
        split_data: Dict[str, List[Dict[str, Any]]] = {"train": [], "validation": [], "test": []}
        for record in records:
            split_name = normalize_split_name(record.get("split", "train"))
            split_data[split_name].append(record)
        return split_data

    return split_records(records)


def build_dataset_summary(dataset: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Any]:
    return {
        "counts": {split_name: len(records) for split_name, records in dataset.items()},
        "total_records": sum(len(records) for records in dataset.values()),
        "samples": {
            split_name: records[:2]
            for split_name, records in dataset.items()
        }
    }

async def process_text_with_gemini(text: str) -> Dict:
    """
    Processes text using Gemini API for extraction and summarization.
    """
    if not model:
        return simulate_ai_processing(text)

    prompt = f"""
    Analyze the following text and provide:
    1. A concise summary as a list of 3 key points.
    2. Structured data extracting:
       - Names (people or organizations)
       - Dates (any mentioned dates)
       - Locations (physical places)
       - Keywords (top 5 essential terms)

    Return the result strictly as a JSON object with the following structure:
    {{
        "summary": ["point 1", "point 2", "point 3"],
        "structured_data": {{
            "names": ["name1", "name2"],
            "dates": ["date1"],
            "locations": ["loc1"],
            "keywords": ["kw1", "kw2"]
        }}
    }}

    Text to analyze:
    {text}
    """

    try:
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"Gemini API Error: {e}")
        return simulate_ai_processing(text)

def simulate_ai_processing(text: str) -> Dict:
    """
    Fallback simulation logic if AI is unavailable.
    """
    if not text.strip():
        return {
            "summary": ["Input text was empty."],
            "structured_data": {
                "names": ["Not Available"],
                "dates": ["Not Available"],
                "locations": ["Not Available"],
                "keywords": ["None"]
            }
        }

    # 1. Summary Generation Logic (Split into sentences and pick first few or make generic points)
    sentences = re.split(r'[.!?]+', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    
    if len(sentences) >= 3:
        summary = [f"Focuses on: {sentences[0][:100]}...", 
                   f"Discusses key details related to {len(sentences)} data points.",
                   "Concludes with specific action items or observations."]
    else:
        summary = [
            "The text provides a brief overview of the input content.",
            "Key information is condensed for quick reading.",
            "Actionable insights are extracted from the provided data."
        ]

    # 2. Structured Data Extraction (Regex Based Heuristics)
    
    # Names: Capitalized words (crude but effective for simulation)
    names = re.findall(r'\b[A-Z][a-z]+ [A-Z][a-z]+\b', text)
    names = list(set(names)) if names else ["Not Available"]

    # Dates: MM/DD/YYYY, YYYY-MM-DD, or Month Day, Year
    date_patterns = [
        r'\d{1,2}/\d{1,2}/\d{2,4}',
        r'\d{4}-\d{2}-\d{2}',
        r'(?:January|February|March|April|May|June|July|August|September|October|November|December)\s\d{1,2},?\s\d{4}'
    ]
    dates = []
    for pattern in date_patterns:
        dates.extend(re.findall(pattern, text))
    dates = list(set(dates)) if dates else ["Not Available"]

    # Locations: Look for "in [Location]", "at [Location]", or "from [Location]"
    locations = re.findall(r'(?:in|at|from|to)\s([A-Z][a-z]+(?: [A-Z][a-z]+)?)', text)
    locations = list(set(locations)) if locations else ["Not Available"]

    # Keywords: Pick words with > 5 chars that are not in a stop list (simulated)
    ignore_words = {"the", "this", "that", "with", "from", "their", "there"}
    keywords = re.findall(r'\b[a-zA-Z]{6,}\b', text)
    keywords = [k.lower() for k in keywords if k.lower() not in ignore_words]
    keywords = list(set(keywords))[:5] if keywords else ["Automation", "Task", "Processing"]

    return {
        "summary": summary,
        "structured_data": {
            "names": names,
            "dates": dates,
            "locations": locations,
            "keywords": keywords
        }
    }

@app.post("/process")
async def process_text(data: InputText):
    try:
        if model and data.text.strip():
            result = await process_text_with_gemini(data.text)
        else:
            result = simulate_ai_processing(data.text)
            
        return {
            "status": "success",
            "raw_text": data.text,
            "summary": result.get("summary", ["Could not generate summary"]),
            "structured_data": result.get("structured_data", {})
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/dataset/import")
async def import_dataset(file: UploadFile = File(...)):
    try:
        filename = file.filename or "dataset"
        content = await file.read()

        if filename.lower().endswith(".json"):
            payload = json.loads(content.decode("utf-8"))
            dataset = load_dataset_from_json(payload)
        elif filename.lower().endswith(".csv"):
            dataset = load_dataset_from_csv(content.decode("utf-8"))
        else:
            raise ValueError("Supported dataset formats are .json and .csv")

        dataset_store["train"] = dataset["train"]
        dataset_store["validation"] = dataset["validation"]
        dataset_store["test"] = dataset["test"]

        return {
            "status": "success",
            "filename": filename,
            "dataset": dataset,
            "summary": build_dataset_summary(dataset)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/dataset/summary")
async def get_dataset_summary():
    return {
        "status": "success",
        "summary": build_dataset_summary(dataset_store)
    }


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "backend": "fastapi",
        "ai_mode": "gemini" if model else "simulation"
    }

# Mount static files AFTER routes to avoid shadowing
app.mount("/", StaticFiles(directory=frontend_path, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
