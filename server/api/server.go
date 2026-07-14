package api

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fxamacker/cbor/v2"
	"github.com/hamsterbase/tasks/server/database"
)

const maxBodyBytes = 16 << 20
const defaultPagePayloadBytes = 2 << 20
const maxPagePayloadBytes = 16 << 20

type Server struct {
	store           *database.Store
	authToken       string
	corsOrigin      string
	staticDir       string
	attachmentStore AttachmentObjectStore
	revisions       *revisionHub
}

type revisionEvent struct {
	clientID string
	revision int64
}

type revisionHub struct {
	mu          sync.Mutex
	subscribers map[string]map[chan revisionEvent]struct{}
}

func newRevisionHub() *revisionHub {
	return &revisionHub{subscribers: make(map[string]map[chan revisionEvent]struct{})}
}

func (h *revisionHub) subscribe(space string) (<-chan revisionEvent, func()) {
	updates := make(chan revisionEvent, 1)
	h.mu.Lock()
	if h.subscribers[space] == nil {
		h.subscribers[space] = make(map[chan revisionEvent]struct{})
	}
	h.subscribers[space][updates] = struct{}{}
	h.mu.Unlock()

	return updates, func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		delete(h.subscribers[space], updates)
		if len(h.subscribers[space]) == 0 {
			delete(h.subscribers, space)
		}
		close(updates)
	}
}

func (h *revisionHub) publish(space string, event revisionEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for subscriber := range h.subscribers[space] {
		select {
		case subscriber <- event:
		default:
			// Only the latest revision matters because clients pull all changes after their cursor.
			<-subscriber
			subscriber <- event
		}
	}
}

type AttachmentObjectStore interface {
	PutObject(ctx context.Context, key string, body io.Reader, size int64, contentType string) error
	StatObject(ctx context.Context, key string) (size int64, contentType string, err error)
	WriteObject(ctx context.Context, key string, destination io.Writer) error
}

type appendChangeRequest struct {
	ClientID string `cbor:"clientId"`
	ChangeID string `cbor:"changeId"`
	Payload  []byte `cbor:"payload"`
}

type putSnapshotRequest struct {
	ClientID       string `cbor:"clientId"`
	CoversRevision int64  `cbor:"coversRevision"`
	Payload        []byte `cbor:"payload"`
}

type appendChangeResponse struct {
	Revision  int64 `cbor:"revision"`
	Duplicate bool  `cbor:"duplicate"`
}

type syncChangeResponse struct {
	Revision int64  `cbor:"revision"`
	ClientID string `cbor:"clientId"`
	ChangeID string `cbor:"changeId"`
	Payload  []byte `cbor:"payload"`
	Created  int64  `cbor:"createdAt"`
}

type syncSnapshotResponse struct {
	Revision int64  `cbor:"revision"`
	Payload  []byte `cbor:"payload"`
	Created  int64  `cbor:"createdAt"`
}

type syncStatusResponse struct {
	Revision         int64 `cbor:"revision" json:"revision"`
	SnapshotRevision int64 `cbor:"snapshotRevision" json:"snapshotRevision"`
}

func New(
	store *database.Store,
	authToken, corsOrigin, staticDir string,
	attachmentStore ...AttachmentObjectStore,
) http.Handler {
	server := &Server{
		store: store, authToken: authToken, corsOrigin: corsOrigin, staticDir: staticDir,
		revisions: newRevisionHub(),
	}
	if len(attachmentStore) > 0 {
		server.attachmentStore = attachmentStore[0]
	}
	go server.forwardDatabaseNotifications()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/health", server.health)
	mux.Handle("PUT /api/v1/attachments/objects/{key...}", server.authorize(http.HandlerFunc(server.putAttachment)))
	mux.Handle("GET /api/v1/attachments/objects/{key...}", server.authorize(http.HandlerFunc(server.getAttachment)))
	mux.Handle("GET /api/v1/spaces/{space}/status", server.authorize(server.canonicalizeSpace(http.HandlerFunc(server.status))))
	mux.Handle("GET /api/v1/spaces/{space}/changes", server.authorize(server.canonicalizeSpace(http.HandlerFunc(server.changes))))
	mux.Handle("GET /api/v1/spaces/{space}/events", server.authorize(server.canonicalizeSpace(http.HandlerFunc(server.events))))
	mux.Handle("GET /api/v1/spaces/{space}/snapshot", server.authorize(server.canonicalizeSpace(http.HandlerFunc(server.getSnapshot))))
	mux.Handle("POST /api/v1/spaces/{space}/changes", server.authorize(server.canonicalizeSpace(http.HandlerFunc(server.appendChange))))
	mux.Handle("PUT /api/v1/spaces/{space}/snapshot", server.authorize(server.canonicalizeSpace(http.HandlerFunc(server.putSnapshot))))
	mux.Handle("DELETE /api/v1/spaces/{space}/clients/{clientId}", server.authorize(server.canonicalizeSpace(http.HandlerFunc(server.deleteClient))))
	if staticDir != "" {
		mux.Handle("/", server.spaHandler())
	}
	return server.cors(negotiateResponseEncoding(mux))
}

func (s *Server) forwardDatabaseNotifications() {
	if s.store == nil {
		return
	}
	for event := range s.store.RevisionNotifications() {
		s.revisions.publish(event.Space, revisionEvent{clientID: event.ClientID, revision: event.Revision})
	}
}

func (s *Server) putAttachment(w http.ResponseWriter, r *http.Request) {
	if s.attachmentStore == nil {
		writeError(w, http.StatusNotFound, "self-hosted attachment storage is not configured")
		return
	}
	key := r.PathValue("key")
	if key == "" || len(key) > 2048 {
		writeError(w, http.StatusBadRequest, "attachment key is invalid")
		return
	}
	if r.ContentLength < 0 {
		writeError(w, http.StatusLengthRequired, "Content-Length is required")
		return
	}
	contentType := r.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	if err := s.attachmentStore.PutObject(r.Context(), key, r.Body, r.ContentLength, contentType); err != nil {
		writeGatewayError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) getAttachment(w http.ResponseWriter, r *http.Request) {
	if s.attachmentStore == nil {
		writeError(w, http.StatusNotFound, "self-hosted attachment storage is not configured")
		return
	}
	key := r.PathValue("key")
	if key == "" || len(key) > 2048 {
		writeError(w, http.StatusBadRequest, "attachment key is invalid")
		return
	}
	size, contentType, err := s.attachmentStore.StatObject(r.Context(), key)
	if err != nil {
		writeGatewayError(w, err)
		return
	}
	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	w.Header().Set("Cache-Control", "private, max-age=3600")
	if err := s.attachmentStore.WriteObject(r.Context(), key, w); err != nil {
		fmt.Printf("attachment download failed: %v\n", err)
	}
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", s.corsOrigin)
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Expose-Headers", "X-Unthink-Revision, X-Unthink-Next-Revision, X-Unthink-Has-More, X-Unthink-Payload-Bytes, X-Unthink-Snapshot-Revision")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) authorize(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			writeError(w, http.StatusUnauthorized, "invalid or missing bearer token")
			return
		}
		provided := strings.TrimPrefix(header, "Bearer ")
		if len(provided) != len(s.authToken) ||
			subtle.ConstantTimeCompare([]byte(provided), []byte(s.authToken)) != 1 {
			writeError(w, http.StatusUnauthorized, "invalid or missing bearer token")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) canonicalizeSpace(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		space := strings.ToLower(strings.TrimSpace(r.PathValue("space")))
		if space == "" {
			writeError(w, http.StatusBadRequest, "space must not be empty")
			return
		}
		r.SetPathValue("space", space)
		next.ServeHTTP(w, r)
	})
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	if err := s.store.Ping(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "database": "ok"})
}

func (s *Server) status(w http.ResponseWriter, r *http.Request) {
	status, err := s.store.Status(r.Context(), r.PathValue("space"))
	if err != nil {
		writeInternalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"protocol": 2, "revision": status.Revision, "snapshotRevision": status.SnapshotRevision,
	})
}

func (s *Server) appendChange(w http.ResponseWriter, r *http.Request) {
	decoder, err := newCBORDecoder(w, r, cborSequenceMediaType)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	requests := make([]appendChangeRequest, 0, 1)
	for len(requests) <= 1000 {
		var request appendChangeRequest
		if err := decoder.Decode(&request); err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid CBOR sequence: %v", err))
			return
		}
		if request.ClientID == "" || request.ChangeID == "" || len(request.Payload) == 0 {
			writeError(w, http.StatusBadRequest, "clientId, changeId and payload are required")
			return
		}
		requests = append(requests, request)
	}
	if len(requests) == 0 {
		writeError(w, http.StatusBadRequest, "request body must contain at least one change")
		return
	}
	if len(requests) > 1000 {
		writeError(w, http.StatusBadRequest, "request body must contain at most 1000 changes")
		return
	}
	responses := make([]any, 0, len(requests))
	for _, request := range requests {
		revision, duplicate, err := s.store.AppendChange(
			r.Context(), r.PathValue("space"), request.ClientID, request.ChangeID, request.Payload,
		)
		if err != nil {
			writeInternalError(w, err)
			return
		}
		responses = append(responses, appendChangeResponse{Revision: revision, Duplicate: duplicate})
	}
	writeCBORSequence(w, http.StatusOK, responses...)
}

func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming is not supported")
		return
	}
	updates, unsubscribe := s.revisions.subscribe(r.PathValue("space"))
	defer unsubscribe()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	if _, err := io.WriteString(w, ": connected\n\n"); err != nil {
		return
	}
	flusher.Flush()

	heartbeat := time.NewTicker(25 * time.Second)
	defer heartbeat.Stop()
	clientID := r.URL.Query().Get("clientId")
	lastRevision := int64(0)
	if s.store != nil {
		status, err := s.store.Status(r.Context(), r.PathValue("space"))
		if err == nil {
			lastRevision = status.Revision
		}
	}

	for {
		select {
		case <-r.Context().Done():
			return
		case event, ok := <-updates:
			if !ok {
				return
			}
			if event.clientID == clientID {
				continue
			}
			if _, err := fmt.Fprintf(w, "id: %d\nevent: revision\ndata: %d\n\n", event.revision, event.revision); err != nil {
				return
			}
			flusher.Flush()
			lastRevision = max(lastRevision, event.revision)
		case <-heartbeat.C:
			if _, err := io.WriteString(w, ": heartbeat\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func (s *Server) changes(w http.ResponseWriter, r *http.Request) {
	after, err := parseNonNegativeInt(r.URL.Query().Get("after"), 0)
	if err != nil {
		writeError(w, http.StatusBadRequest, "after must be a non-negative integer")
		return
	}
	limit, err := parseNonNegativeInt(r.URL.Query().Get("limit"), 500)
	if err != nil || limit < 1 || limit > 1000 {
		writeError(w, http.StatusBadRequest, "limit must be between 1 and 1000")
		return
	}
	maxBytes, err := parseNonNegativeInt(r.URL.Query().Get("maxBytes"), defaultPagePayloadBytes)
	if err != nil || maxBytes < 1 || maxBytes > maxPagePayloadBytes {
		writeError(w, http.StatusBadRequest, "maxBytes must be between 1 and 16777216")
		return
	}
	page, err := s.store.ListChanges(
		r.Context(), r.PathValue("space"), r.URL.Query().Get("clientId"), after, int(limit), maxBytes,
	)
	if err != nil {
		writeInternalError(w, err)
		return
	}
	if page.SnapshotRevision > after {
		writeJSON(w, http.StatusConflict, map[string]any{
			"error": "snapshot required", "code": "snapshot_required",
			"snapshotRevision": page.SnapshotRevision,
		})
		return
	}
	w.Header().Set("X-Unthink-Revision", strconv.FormatInt(page.Revision, 10))
	w.Header().Set("X-Unthink-Next-Revision", strconv.FormatInt(page.NextRevision, 10))
	w.Header().Set("X-Unthink-Has-More", strconv.FormatBool(page.HasMore))
	w.Header().Set("X-Unthink-Payload-Bytes", strconv.FormatInt(page.PayloadBytes, 10))
	w.Header().Set("X-Unthink-Snapshot-Revision", strconv.FormatInt(page.SnapshotRevision, 10))
	w.Header().Set("Content-Type", cborSequenceMediaType)
	w.WriteHeader(http.StatusOK)
	encoder := cbor.NewEncoder(w)
	for _, change := range page.Changes {
		if err := encoder.Encode(syncChangeResponse{
			Revision: change.Revision,
			ClientID: change.ClientID,
			ChangeID: change.ChangeID,
			Payload:  change.Payload,
			Created:  change.Created,
		}); err != nil {
			return
		}
	}
}

func (s *Server) getSnapshot(w http.ResponseWriter, r *http.Request) {
	snapshot, err := s.store.GetSnapshot(r.Context(), r.PathValue("space"))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "snapshot not found")
			return
		}
		writeInternalError(w, err)
		return
	}
	writeCBOR(w, http.StatusOK, syncSnapshotResponse{
		Revision: snapshot.Revision,
		Payload:  snapshot.Payload,
		Created:  snapshot.Created,
	})
}

func (s *Server) putSnapshot(w http.ResponseWriter, r *http.Request) {
	var request putSnapshotRequest
	if err := decodeCBOR(w, r, &request); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if request.ClientID == "" || len(request.Payload) == 0 || request.CoversRevision < 0 {
		writeError(w, http.StatusBadRequest,
			"clientId, payload and a non-negative coversRevision are required")
		return
	}
	status, err := s.store.PutSnapshot(
		r.Context(), r.PathValue("space"), request.CoversRevision, request.Payload,
	)
	if err != nil {
		if strings.Contains(err.Error(), "exceeds server revision") {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		writeInternalError(w, err)
		return
	}
	writeCBOR(w, http.StatusOK, syncStatusResponse{
		Revision: status.Revision, SnapshotRevision: status.SnapshotRevision,
	})
}

func (s *Server) deleteClient(w http.ResponseWriter, r *http.Request) {
	clientID := strings.TrimSpace(r.PathValue("clientId"))
	if clientID == "" {
		writeError(w, http.StatusBadRequest, "clientId must not be empty")
		return
	}
	if err := s.store.DeleteClient(r.Context(), r.PathValue("space"), clientID); err != nil {
		writeInternalError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) spaHandler() http.Handler {
	files := http.FileServer(http.Dir(s.staticDir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requested := filepath.Join(s.staticDir, filepath.Clean(r.URL.Path))
		if info, err := os.Stat(requested); err == nil && !info.IsDir() {
			files.ServeHTTP(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(s.staticDir, "index.html"))
	})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, destination any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		if errors.Is(err, io.EOF) {
			return errors.New("request body is required")
		}
		return fmt.Errorf("invalid JSON body: %w", err)
	}
	return nil
}

func parseNonNegativeInt(raw string, fallback int64) (int64, error) {
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value < 0 {
		return 0, errors.New("invalid non-negative integer")
	}
	return value, nil
}

func writeInternalError(w http.ResponseWriter, err error) {
	fmt.Printf("request failed: %v\n", err)
	writeError(w, http.StatusInternalServerError, "internal server error")
}

func writeGatewayError(w http.ResponseWriter, err error) {
	fmt.Printf("attachment storage request failed: %v\n", err)
	writeError(w, http.StatusBadGateway, "attachment storage unavailable")
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
