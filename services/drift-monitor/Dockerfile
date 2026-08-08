FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN groupadd --system --gid 10001 guardrail \
    && useradd --system --uid 10001 --gid guardrail --create-home guardrail

COPY requirements.txt ./
RUN pip install --disable-pip-version-check --no-cache-dir -r requirements.txt
RUN pip install --disable-pip-version-check --no-cache-dir https://github.com/explosion/spacy-models/releases/download/en_core_web_lg-3.8.0/en_core_web_lg-3.8.0-py3-none-any.whl
RUN python -c "import spacy; spacy.load('en_core_web_lg'); print('spaCy model ok')"

COPY main.py swarm.py ./

USER guardrail
EXPOSE 8000

# PORT env var is injected by managed platforms (Cloud Run, Railway, ECS).
# Falls back to 8000 for Docker Compose and local runs.
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]

