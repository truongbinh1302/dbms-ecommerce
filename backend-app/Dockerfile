# API BinhTinhStore. Build từ thư mục gốc repo:
#   docker build -f backend-app/Dockerfile -t binhtinhstore-api .
# (cần thư mục database/ để chạy run-migration.js và run-seed.js trong container)
ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE}

ENV NODE_ENV=production
WORKDIR /srv/backend-app

COPY backend-app/package.json backend-app/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY backend-app/src ./src
COPY backend-app/run-migration.js backend-app/run-seed.js ./
# Script đo trợ lý AI ráp máy cho báo cáo (scripts/eval-build-agent.js).
COPY backend-app/scripts ./scripts
COPY database /srv/database

# Ảnh sản phẩm tải lên nằm ở uploads/ (gắn volume để không mất khi tạo lại container).
RUN mkdir -p uploads && chown -R node:node uploads
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/app.js"]
