import os
from pathlib import Path

file_path = Path(__file__).resolve()
backend_dir = file_path.parent
root_dir = backend_dir.parent
frontend_dir = root_dir / "frontend"

print(f"File Path: {file_path}")
print(f"Backend Dir: {backend_dir}")
print(f"Root Dir: {root_dir}")
print(f"Frontend Dir: {frontend_dir}")
print(f"Frontend Dir exists: {frontend_dir.exists()}")
if frontend_dir.exists():
    print(f"Contents of Frontend Dir: {os.listdir(frontend_dir)}")
