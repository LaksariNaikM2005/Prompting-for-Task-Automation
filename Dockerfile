# Use official Python image
FROM python:3.13-slim-bookworm

# Set working directory
WORKDIR /app

# Copy dependency file
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend and frontend code
COPY backend ./backend
COPY frontend ./frontend

# Expose port
EXPOSE 8000

# Run app from the backend directory
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]