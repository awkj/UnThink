package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/fxamacker/cbor/v2"
	"github.com/hamsterbase/tasks/server/api"
	"github.com/hamsterbase/tasks/server/database"
	"github.com/klauspost/compress/zstd"
)

type memoryAttachmentStore struct {
	objects map[string][]byte
	types   map[string]string
}

func newMemoryAttachmentStore() *memoryAttachmentStore {
	return &memoryAttachmentStore{objects: make(map[string][]byte), types: make(map[string]string)}
}

func (s *memoryAttachmentStore) PutObject(
	_ context.Context,
	key string,
	body io.Reader,
	_ int64,
	contentType string,
) error {
	contents, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	s.objects[key] = contents
	s.types[key] = contentType
	return nil
}

func (s *memoryAttachmentStore) StatObject(_ context.Context, key string) (int64, string, error) {
	contents, ok := s.objects[key]
	if !ok {
		return 0, "", os.ErrNotExist
	}
	return int64(len(contents)), s.types[key], nil
}

func (s *memoryAttachmentStore) WriteObject(_ context.Context, key string, destination io.Writer) error {
	contents, ok := s.objects[key]
	if !ok {
		return os.ErrNotExist
	}
	_, err := destination.Write(contents)
	return err
}

const testToken = "test-token-with-enough-entropy"

type testChangeRequest struct {
	ClientID string `cbor:"clientId"`
	ChangeID string `cbor:"changeId"`
	Payload  []byte `cbor:"payload"`
}

type testAppendResponse struct {
	Revision  int64 `cbor:"revision"`
	Duplicate bool  `cbor:"duplicate"`
}

type testChangeResponse struct {
	Revision int64  `cbor:"revision"`
	Payload  []byte `cbor:"payload"`
}

type testSnapshotRequest struct {
	ClientID       string `cbor:"clientId"`
	CoversRevision int64  `cbor:"coversRevision"`
	Payload        []byte `cbor:"payload"`
}

type testSnapshotResponse struct {
	Revision int64  `cbor:"revision"`
	Payload  []byte `cbor:"payload"`
}

type testStatusResponse struct {
	Revision         int64 `cbor:"revision"`
	SnapshotRevision int64 `cbor:"snapshotRevision"`
}

func TestSyncAPI(t *testing.T) {
	store, err := database.Open(context.Background(), testDatabaseURL(t), testToken)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	server := httptest.NewServer(api.New(store, testToken, "*", ""))
	t.Cleanup(server.Close)
	space := fmt.Sprintf("sync-api-%d", time.Now().UnixNano())
	spacePath := "/api/v1/spaces/" + space

	response := request(t, server.URL, http.MethodGet, "/api/v1/health", "", nil)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("health status = %d", response.StatusCode)
	}
	response.Body.Close()

	response = request(t, server.URL, http.MethodGet, spacePath+"/status", "", nil)
	if response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d", response.StatusCode)
	}
	response.Body.Close()

	first := testChangeRequest{ClientID: "web-1", ChangeID: "change-1", Payload: []byte("first")}
	result := requestCBORSequence[testAppendResponse](t, server.URL, http.MethodPost, spacePath+"/changes", []any{first})
	if result[0].Revision != 1 || result[0].Duplicate {
		t.Fatalf("unexpected first append response: %#v", result[0])
	}
	result = requestCBORSequence[testAppendResponse](t, server.URL, http.MethodPost, spacePath+"/changes", []any{first})
	if result[0].Revision != 1 || !result[0].Duplicate {
		t.Fatalf("unexpected duplicate append response: %#v", result[0])
	}

	second := testChangeRequest{ClientID: "android-1", ChangeID: "change-2", Payload: []byte("second")}
	result = requestCBORSequence[testAppendResponse](t, server.URL, http.MethodPost, spacePath+"/changes", []any{second})
	if result[0].Revision != 2 {
		t.Fatalf("unexpected second append response: %#v", result[0])
	}
	status := requestJSON(t, server.URL, http.MethodGet, "/api/v1/spaces/"+space+"/status", nil)
	if status["protocol"].(float64) != 2 || status["revision"].(float64) != 2 {
		t.Fatalf("unexpected status: %#v", status)
	}

	changesResponse := request(t, server.URL, http.MethodGet,
		spacePath+"/changes?after=0&clientId=web-1&maxBytes=5", testToken, nil)
	changes := decodeCBORSequence[testChangeResponse](t, changesResponse)
	if len(changes) != 1 || changes[0].Revision != 1 || changesResponse.Header.Get("X-Unthink-Has-More") != "true" ||
		changesResponse.Header.Get("X-Unthink-Next-Revision") != "1" ||
		changesResponse.Header.Get("X-Unthink-Payload-Bytes") != "5" {
		t.Fatalf("unexpected byte-bounded change page: %#v, headers=%v", changes, changesResponse.Header)
	}

	snapshot := testSnapshotRequest{ClientID: "web-1", CoversRevision: 1, Payload: []byte("snapshot")}
	snapshotStatus := requestCBOR[testStatusResponse](t, server.URL, http.MethodPut, spacePath+"/snapshot", snapshot)
	if snapshotStatus.SnapshotRevision != 1 {
		t.Fatalf("unexpected snapshot response: %#v", snapshotStatus)
	}

	response = request(t, server.URL, http.MethodGet,
		spacePath+"/changes?after=0&clientId=new-device", testToken, nil)
	defer response.Body.Close()
	if response.StatusCode != http.StatusConflict {
		t.Fatalf("stale cursor status = %d", response.StatusCode)
	}
	var snapshotRequired map[string]any
	if err := json.NewDecoder(response.Body).Decode(&snapshotRequired); err != nil {
		t.Fatal(err)
	}
	if snapshotRequired["code"] != "snapshot_required" {
		t.Fatalf("unexpected stale cursor response: %#v", snapshotRequired)
	}

	snapshotResult := requestCBOR[testSnapshotResponse](t, server.URL, http.MethodGet, spacePath+"/snapshot", nil)
	if snapshotResult.Revision != 1 || string(snapshotResult.Payload) != "snapshot" {
		t.Fatalf("unexpected snapshot: %#v", snapshotResult)
	}
	changesResponse = request(t, server.URL, http.MethodGet,
		spacePath+"/changes?after=1&clientId=new-device", testToken, nil)
	changes = decodeCBORSequence[testChangeResponse](t, changesResponse)
	if len(changes) != 1 || changes[0].Revision != 2 || string(changes[0].Payload) != "second" {
		t.Fatalf("unexpected changes after snapshot: %#v", changes)
	}

	response = request(t, server.URL, http.MethodDelete,
		spacePath+"/clients/new-device", testToken, nil)
	defer response.Body.Close()
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("delete client status = %d", response.StatusCode)
	}
}

func TestRejectsSnapshotAheadOfServer(t *testing.T) {
	store, err := database.Open(context.Background(), testDatabaseURL(t), testToken)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	server := httptest.NewServer(api.New(store, testToken, "*", ""))
	t.Cleanup(server.Close)

	body := testSnapshotRequest{ClientID: "web-1", CoversRevision: 1, Payload: []byte("snapshot")}
	encoded, _ := cbor.Marshal(body)
	response := requestWithContentType(
		t, server.URL, http.MethodPut, "/api/v1/spaces/snapshot-ahead/snapshot", testToken, encoded, "application/cbor",
	)
	defer response.Body.Close()
	if response.StatusCode != http.StatusConflict {
		contents, _ := io.ReadAll(response.Body)
		t.Fatalf("status = %d, body = %s", response.StatusCode, contents)
	}
}

func TestJSONZstdNegotiation(t *testing.T) {
	handler := api.New(nil, testToken, "*", "", newMemoryAttachmentStore())
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	req, err := http.NewRequest(http.MethodGet, server.URL+"/api/v1/attachments/objects/test", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Accept-Encoding", "zstd")
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.Header.Get("Content-Encoding") != "zstd" {
		t.Fatalf("content encoding = %q", response.Header.Get("Content-Encoding"))
	}
	decoder, err := zstd.NewReader(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	defer decoder.Close()
	var result map[string]any
	if err := json.NewDecoder(decoder).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if result["error"] != "invalid or missing bearer token" {
		t.Fatalf("unexpected JSON response: %#v", result)
	}
}

func TestAttachmentObjects(t *testing.T) {
	attachments := newMemoryAttachmentStore()
	handler := api.New(nil, testToken, "*", "", attachments)
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	upload := request(
		t,
		server.URL,
		http.MethodPut,
		"/api/v1/attachments/objects/local/attachments/test.txt",
		testToken,
		[]byte("attachment contents"),
	)
	upload.Body.Close()
	if upload.StatusCode != http.StatusNoContent {
		t.Fatalf("upload status = %d", upload.StatusCode)
	}

	download := request(
		t,
		server.URL,
		http.MethodGet,
		"/api/v1/attachments/objects/local/attachments/test.txt",
		testToken,
		nil,
	)
	defer download.Body.Close()
	contents, err := io.ReadAll(download.Body)
	if err != nil {
		t.Fatal(err)
	}
	if download.StatusCode != http.StatusOK || string(contents) != "attachment contents" {
		t.Fatalf("download status = %d, body = %q", download.StatusCode, contents)
	}
}

func testDatabaseURL(t *testing.T) string {
	t.Helper()
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	return databaseURL
}

func requestJSON(
	t *testing.T,
	baseURL string,
	method string,
	path string,
	payload map[string]any,
) map[string]any {
	t.Helper()
	var body []byte
	if payload != nil {
		body, _ = json.Marshal(payload)
	}
	response := request(t, baseURL, method, path, testToken, body)
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		contents, _ := io.ReadAll(response.Body)
		t.Fatalf("%s %s status = %d, body = %s", method, path, response.StatusCode, contents)
	}
	var result map[string]any
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	return result
}

func requestCBOR[T any](
	t *testing.T,
	baseURL string,
	method string,
	path string,
	payload any,
) T {
	t.Helper()
	var body []byte
	if payload != nil {
		var err error
		body, err = cbor.Marshal(payload)
		if err != nil {
			t.Fatal(err)
		}
	}
	response := requestWithContentType(t, baseURL, method, path, testToken, body, "application/cbor")
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		contents, _ := io.ReadAll(response.Body)
		t.Fatalf("%s %s status = %d, body = %s", method, path, response.StatusCode, contents)
	}
	if mediaType := response.Header.Get("Content-Type"); mediaType != "application/cbor" {
		t.Fatalf("content type = %q", mediaType)
	}
	var result T
	if err := cbor.NewDecoder(response.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	return result
}

func requestCBORSequence[T any](
	t *testing.T,
	baseURL string,
	method string,
	path string,
	payloads []any,
) []T {
	t.Helper()
	var body bytes.Buffer
	encoder := cbor.NewEncoder(&body)
	for _, payload := range payloads {
		if err := encoder.Encode(payload); err != nil {
			t.Fatal(err)
		}
	}
	response := requestWithContentType(
		t, baseURL, method, path, testToken, body.Bytes(), "application/cbor-seq",
	)
	return decodeCBORSequence[T](t, response)
}

func decodeCBORSequence[T any](t *testing.T, response *http.Response) []T {
	t.Helper()
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		contents, _ := io.ReadAll(response.Body)
		t.Fatalf("status = %d, body = %s", response.StatusCode, contents)
	}
	if mediaType := response.Header.Get("Content-Type"); mediaType != "application/cbor-seq" {
		t.Fatalf("content type = %q", mediaType)
	}
	var results []T
	decoder := cbor.NewDecoder(response.Body)
	for {
		var result T
		if err := decoder.Decode(&result); err != nil {
			if err == io.EOF {
				return results
			}
			t.Fatal(err)
		}
		results = append(results, result)
	}
}

func request(
	t *testing.T,
	baseURL string,
	method string,
	path string,
	token string,
	body []byte,
) *http.Response {
	return requestWithContentType(t, baseURL, method, path, token, body, "application/json")
}

func requestWithContentType(
	t *testing.T,
	baseURL string,
	method string,
	path string,
	token string,
	body []byte,
	contentType string,
) *http.Response {
	t.Helper()
	request, err := http.NewRequest(method, baseURL+path, bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	if body != nil {
		request.Header.Set("Content-Type", contentType)
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	return response
}
