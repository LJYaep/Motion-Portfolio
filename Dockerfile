FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY application.py enquiry_backend.py start_website_support.py ./
COPY index.html work.html about.html services.html contact.html styles.css script.js public-config.js ./
COPY assets ./assets
ENV ENQUIRY_DB_PATH=/data/enquiries.sqlite3
EXPOSE 8080
CMD ["waitress-serve", "--listen=0.0.0.0:8080", "--max-request-body-size=16000", "--call", "application:create_app"]
