package api

import (
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"github.com/fxamacker/cbor/v2"
	"github.com/klauspost/compress/zstd"
)

const (
	cborMediaType         = "application/cbor"
	cborSequenceMediaType = "application/cbor-seq"
)

func decodeCBOR(w http.ResponseWriter, r *http.Request, destination any) error {
	decoder, err := newCBORDecoder(w, r, cborMediaType)
	if err != nil {
		return err
	}
	if err := decoder.Decode(destination); err != nil {
		if errors.Is(err, io.EOF) {
			return errors.New("request body is required")
		}
		return fmt.Errorf("invalid CBOR body: %w", err)
	}
	return nil
}

func newCBORDecoder(w http.ResponseWriter, r *http.Request, expectedMediaType string) (*cbor.Decoder, error) {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != expectedMediaType {
		return nil, fmt.Errorf("Content-Type must be %s", expectedMediaType)
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	return cbor.NewDecoder(r.Body), nil
}

func writeCBOR(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", cborMediaType)
	w.WriteHeader(status)
	_ = cbor.NewEncoder(w).Encode(payload)
}

func writeCBORSequence(w http.ResponseWriter, status int, payloads ...any) {
	w.Header().Set("Content-Type", cborSequenceMediaType)
	w.WriteHeader(status)
	encoder := cbor.NewEncoder(w)
	for _, payload := range payloads {
		if err := encoder.Encode(payload); err != nil {
			return
		}
	}
}

type negotiatedResponseWriter struct {
	http.ResponseWriter
	acceptsZstd bool
	zstdWriter  *zstd.Encoder
	wroteHeader bool
}

func (w *negotiatedResponseWriter) WriteHeader(status int) {
	if w.wroteHeader {
		return
	}
	w.wroteHeader = true
	if strings.HasPrefix(w.Header().Get("Content-Type"), "application/json") {
		w.Header().Add("Vary", "Accept-Encoding")
		if w.acceptsZstd && status != http.StatusNoContent && status != http.StatusNotModified {
			encoder, err := zstd.NewWriter(w.ResponseWriter, zstd.WithEncoderLevel(zstd.SpeedFastest))
			if err == nil {
				w.zstdWriter = encoder
				w.Header().Set("Content-Encoding", "zstd")
				w.Header().Del("Content-Length")
			}
		}
	}
	w.ResponseWriter.WriteHeader(status)
}

func (w *negotiatedResponseWriter) Write(contents []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	if w.zstdWriter != nil {
		return w.zstdWriter.Write(contents)
	}
	return w.ResponseWriter.Write(contents)
}

func (w *negotiatedResponseWriter) Flush() {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	if w.zstdWriter != nil {
		_ = w.zstdWriter.Flush()
	}
	_ = http.NewResponseController(w.ResponseWriter).Flush()
}

func (w *negotiatedResponseWriter) close() {
	if w.zstdWriter != nil {
		_ = w.zstdWriter.Close()
	}
}

func negotiateResponseEncoding(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		wrapped := &negotiatedResponseWriter{
			ResponseWriter: w,
			acceptsZstd:    acceptsEncoding(r.Header.Get("Accept-Encoding"), "zstd"),
		}
		defer wrapped.close()
		next.ServeHTTP(wrapped, r)
	})
}

func acceptsEncoding(header, encoding string) bool {
	for value := range strings.SplitSeq(header, ",") {
		name, parameters, _ := strings.Cut(strings.TrimSpace(value), ";")
		quality := 1.0
		for parameter := range strings.SplitSeq(parameters, ";") {
			key, rawValue, found := strings.Cut(strings.TrimSpace(parameter), "=")
			if !found || !strings.EqualFold(key, "q") {
				continue
			}
			if parsed, err := strconv.ParseFloat(strings.TrimSpace(rawValue), 64); err == nil {
				quality = parsed
			}
		}
		if quality <= 0 {
			continue
		}
		if strings.EqualFold(name, encoding) || name == "*" {
			return true
		}
	}
	return false
}
