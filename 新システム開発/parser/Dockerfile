# 経路Bの分解サーバー（Cloud Run）。日本語OCRのため Tesseract（日本語データ）、画像の図を線に直すため potrace を入れる。
FROM python:3.13-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-jpn potrace \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY qlp_parser ./qlp_parser
ENV PYTHONUNBUFFERED=1
CMD ["python", "-m", "qlp_parser.server"]
