FROM node:24-alpine AS web
ARG NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
ARG PNPM_VERSION=11.13.0
ENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY} \
    PNPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY} \
    COREPACK_NPM_REGISTRY=${NPM_CONFIG_REGISTRY}
WORKDIR /src
RUN corepack enable \
    && corepack install --global "pnpm@${PNPM_VERSION}" \
    && pnpm config set registry "${NPM_CONFIG_REGISTRY}"
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm web:build

FROM golang:1.26-alpine AS api
ARG GOPROXY=https://goproxy.cn,direct
ENV GOPROXY=${GOPROXY}
WORKDIR /src
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/cmd ./cmd
COPY server/api ./api
COPY server/attachmentstore ./attachmentstore
COPY server/config ./config
COPY server/database ./database
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/tasks-server ./cmd/tasks-server

FROM alpine:3.24
RUN apk add --no-cache ca-certificates \
    && addgroup -S tasks \
    && adduser -S -G tasks tasks \
    && mkdir -p /app/static \
    && chown -R tasks:tasks /app
WORKDIR /app
COPY --from=api /out/tasks-server /app/tasks-server
COPY --from=web /src/dist /app/static
USER tasks
ENV ADDRESS=:8400 STATIC_DIR=/app/static
EXPOSE 8400
ENTRYPOINT ["/app/tasks-server"]
