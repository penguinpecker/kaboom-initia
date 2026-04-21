FROM golang:1.23-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends git make ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ARG MINIEVM_TAG=v1.2.15
RUN git clone --depth 1 --branch ${MINIEVM_TAG} https://github.com/initia-labs/minievm /src
WORKDIR /src
RUN make install && strip /go/bin/minitiad

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates jq curl \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /go/bin/minitiad /usr/local/bin/minitiad
COPY minitia-state.tar.gz /seed/minitia-state.tar.gz
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENV HOME=/data
EXPOSE 8545 8546 26657
ENTRYPOINT ["/entrypoint.sh"]
