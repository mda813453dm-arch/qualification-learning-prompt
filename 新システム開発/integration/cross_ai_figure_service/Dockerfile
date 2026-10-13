FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN useradd --create-home --uid 10001 appuser
COPY cross_ai_figure_service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY extract_attached_pdf_figure.py ./extract_attached_pdf_figure.py
COPY cross_ai_figure_service/server.py ./server.py
COPY cross_ai_figure_service/mcp_protocol.py ./cross_ai_figure_service/mcp_protocol.py
COPY cross_ai_figure_service/__init__.py ./cross_ai_figure_service/__init__.py
COPY cross_ai_figure_service/cross-ai-figure-manifest.json ./question-layouts.json
RUN mkdir -p /data/figure-store && chown -R appuser:appuser /app /data
USER appuser
ENV FIGURE_MANIFEST_PATH=/app/question-layouts.json \
    FIGURE_STORE_DIR=/data/figure-store \
    FIGURE_BIND_HOST=0.0.0.0 \
    PORT=8080
EXPOSE 8080
CMD ["python", "server.py"]
