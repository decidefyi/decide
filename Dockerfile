FROM node:20-alpine

WORKDIR /app

COPY . .

# Vercel CLI is used for the local runtime entrypoint in this repo.
RUN npm install -g vercel@latest

ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["sh", "-c", "vercel dev --listen 0.0.0.0:${PORT:-3000}"]
