FROM python:3.10-slim

WORKDIR /app

# Install system packages (if needed)
RUN apt-get update && apt-get install -y build-essential libpq-dev

# Copy requirements and install
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy the rest of the app
COPY . .

# Command to run the app (e.g. Daphne)
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "jukbox.asgi:application"]
