FROM node:20-alpine

WORKDIR /app

# Vercel CLI is used for the local runtime entrypoint in this repo.
RUN npm install -g vercel@latest \
  && addgroup -S app \
  && adduser -S app -G app

COPY --chown=app:app . .

ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000

USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const port = process.env.PORT || 3000; fetch('http://127.0.0.1:' + port + '/api/health').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["sh", "-c", "vercel dev --listen 0.0.0.0:${PORT:-3000}"]
